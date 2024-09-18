import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Cron } from '@nestjs/schedule';
@Injectable()
export class AppService {
  private baseUrl: string = 'https://api-v2.solscan.io/v2';
  private config: AxiosRequestConfig;
  private signers = {};
  private async makeRequest<T>(url: string, param: string): Promise<T> {
    const maxRetries = 5;
    let retries = 0;
    this.config = {};
    while (retries < maxRetries) {
      try {
        const proxyUrl =
          'http://diemmy889980:gfH7y83JrjC7zrw8_country-UnitedStates@proxy.packetstream.io:31112';
        if (proxyUrl) {
          this.config.httpsAgent = new HttpsProxyAgent(proxyUrl);
          this.config.proxy = false; // Disable axios' default proxy handling
          this.config.timeout = 10000;
        }
        const headers = {
          'Content-Type': 'gzip, deflate, br',
          Origin: 'https://solscan.io',
        };
        if (headers) {
          this.config.headers = headers;
        }
        const config: AxiosRequestConfig = {
          ...this.config,
        };

        try {
          const response = await axios.get(url + param, config);
          return response.data.data;
        } catch (error) {
          throw error;
        }
      } catch (error) {
        console.log(error);
        console.log('retry', retries);
        retries++;
      }
    }
    if (retries === maxRetries) {
      console.error('Max retries reached. Could not complete bot detection.');
    }
  }

  async getLastBlock(): Promise<any> {
    return this.makeRequest<any[]>(`${this.baseUrl}/block/last`, '');
  }

  async getBlockTransactions(blockNumber: number): Promise<any[]> {
    const trans = await this.makeRequest<any[]>(
      `${this.baseUrl}/block/transactions`,
      `?block=${blockNumber}`,
    );
    return trans['transactions'];
  }

  async getTransactionDetail(txHash: string): Promise<any> {
    return this.makeRequest<any>(
      `${this.baseUrl}/transaction/detail`,
      `?tx=${txHash}`,
    );
  }

  getActionsSwap(actions: any[]): any {
    const actionsParsed: any = [];

    for (const action of actions) {
      for (const title of action['title']) {
        for (const item of title) {
          for (const key of Object.keys(item)) {
            if (key === 'token_amount') {
              actionsParsed.push(item[key]);
            }
          }
        }
      }
    }

    const lenActions = actionsParsed.length;

    return {
      actionFirst: actionsParsed.length > 0 ? actionsParsed[0] : null,
      actionLast:
        actionsParsed.length > 0
          ? actionsParsed[actionsParsed.length - 1]
          : null,
      lenActions: lenActions,
    };
  }

  processSwapAction(actionSwapFirst: any[], actionSwapLast: any[]): boolean {
    if (actionSwapFirst && actionSwapLast) {
      // Condition 2: Compare in and out token same
      return (
        actionSwapFirst['token_address'] === actionSwapLast['token_address']
      );
    }
  }

  // @Cron('0 */12 * * * *')
  async detectBot(): Promise<any> {
    console.log('cron');
    try {
      const lastBlocks = await this.getLastBlock();

      for (const block of lastBlocks) {
        try {
          const transactions = await this.getBlockTransactions(
            block.currentSlot,
          );
          console.log(
            `block number ${block.currentSlot} in range [ ${lastBlocks[0].currentSlot} to ${lastBlocks[lastBlocks.length - 1].currentSlot} ]`,
          );
          for (const transaction of transactions) {
            for (const ins of transaction['parsedInstruction']) {
              // condition 1: Instruction Type
              if (
                ['route', 'raydium:swap', 'swap', 'swapBaseIn'].includes(
                  ins['type'],
                )
              ) {
                console.log('transaction hash', transaction['txHash']);
                const tx = await this.getTransactionDetail(
                  transaction['txHash'],
                );
                if (
                  Array.isArray(tx['render_summary_main_actions']) &&
                  tx['render_summary_main_actions']
                ) {
                  const { actionFirst, actionLast } = this.getActionsSwap(
                    tx['render_summary_main_actions'],
                  );
                  if (this.processSwapAction(actionFirst, actionLast)) {
                    if (Array.isArray(tx['signers'])) {
                      for (const signer of tx['signers']) {
                        if (this.signers[signer]) {
                          this.signers[signer]++;
                        } else {
                          this.signers[signer] = 1;
                        }
                      }
                      this.sendDataToEndpoint(this.signers);
                    }

                    break;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log('Error request', e);
        }
      }

      console.log('Success detected bot');
    } catch (error) {
      console.error('Error in bot detection:', error);
    }
  }

  private async sendDataToEndpoint(data: any): Promise<void> {
    const endpoint =
      'https://script.google.com/macros/s/AKfycbzPUpFPQQR5sZi5vfDSd5QX5WsWOkMz45sJOfZG2TqCtv0tXfXO1h7mUTQ_seINIo4/exec';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Data sent successfully:', result);
    } catch (error) {
      console.error('Error sending data to endpoint:', error);
    }
  }
}
