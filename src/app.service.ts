import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Cron } from '@nestjs/schedule';
@Injectable()
export class AppService {
  private baseUrl: string = 'https://api-v2.solscan.io/v2';
  private config: AxiosRequestConfig;

  private async makeRequest<T>(url: string, param: string): Promise<T> {
    this.config = {};
    const proxyUrl =
      'http://diemmy889980:gfH7y83JrjC7zrw8_country-Canada@proxy.packetstream.io:31112';
    if (proxyUrl) {
      this.config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      this.config.proxy = false; // Disable axios' default proxy handling
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
    url += param;

    try {
      const response = await axios.get(url, config);
      return response.data.data;
    } catch (error) {
      throw error;
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

  @Cron('0 */12 * * * *')
  async detectBot(): Promise<any> {
    try {
      const lastBlocks = await this.getLastBlock();
      const signers = {};
      for (const block of lastBlocks) {
        try {
          const transactions = await this.getBlockTransactions(
            block.currentSlot,
          );
          console.log('block: ', block.currentSlot);
          for (const transaction of transactions) {
            for (const ins of transaction['parsedInstruction']) {
              // condition 1: Instruction Type
              if (
                ['route', 'raydium:swap', 'swap', 'swapBaseIn'].includes(
                  ins['type'],
                )
              ) {
                const tx = await this.getTransactionDetail(
                  transaction['txHash'],
                );
                if (tx['render_summary_main_actions']) {
                  const { actionFirst, actionLast } = this.getActionsSwap(
                    tx['render_summary_main_actions'],
                  );
                  if (this.processSwapAction(actionFirst, actionLast)) {
                    for (const signer of tx['signers']) {
                      if (signers[signer]) {
                        signers[signer]++;
                      } else {
                        signers[signer] = 1;
                      }
                    }
                    break;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log('Error request');
        }
      }

      await this.sendDataToEndpoint(signers);
    } catch (error) {
      console.error('Error in bot detection:', error);
    }
  }

  private async sendDataToEndpoint(data: any): Promise<void> {
    const endpoint =
      'https://script.google.com/macros/s/AKfycbxJ67F-Vc-hZRORDD2d6DGvz9Ntyb0151jyLtZa24oq_mZ5wb8XYoltVoLO3Yqrog/exec';

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
