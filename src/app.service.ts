import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'fs';
import * as path from 'path';
import { Cron } from '@nestjs/schedule';
interface BotData {
  [key: string]: {
    transactions: string;
    timestamp: number;
    profit: number;
    token: string;
    price: number;
    count: number;
  };
}
@Injectable()
export class AppService {
  private baseUrl: string = 'https://api-v2.solscan.io/v2';
  private config: AxiosRequestConfig;
  private signers = {};
  private timeStart: number;
  private timeEnd: number;
  constructor() {
    this.timeStart = Date.now(); // Thời điểm hiện tại
    this.timeEnd = this.timeStart + 24 * 60 * 60 * 1000; // 24 giờ sau đó
  }
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

  saveBotDataToCSV(data: BotData, fileName: string = 'bot_data.csv'): void {
    // Tạo header cho file CSV
    const header = 'bot_id,profit,count_tx,transactions\n';

    // Chuyển đổi dữ liệu thành format CSV
    const csvContent = Object.entries(data).reduce((acc, [bot_id, botInfo]) => {
      return (
        acc +
        `${bot_id},${botInfo.profit},${botInfo.count},${JSON.stringify(botInfo.transactions)}\n`
      );
    }, header);

    // Tạo đường dẫn đầy đủ cho file
    const filePath = path.join(process.cwd(), fileName);

    // Ghi dữ liệu vào file
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    console.log(`CSV file has been saved to ${filePath}`);
  }

  @Cron('0 */9 * * * *')
  async detectBot(): Promise<any> {
    const timeCurent = Date.now();
    if (timeCurent > this.timeEnd) {
      this.saveBotDataToCSV(
        this.signers,
        `bots_report_from_${this.timeStart}_to_${this.timeEnd}`,
      );
      this.timeStart = timeCurent;
      this.timeEnd = this.timeStart + 24 * 60 * 60 * 1000;
    }
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
                    if (Array.isArray(tx['signer'])) {
                      for (const signer of tx['signer']) {
                        const fee =
                          transaction['fee'] != 0
                            ? transaction['fee'] / 10 ** 9
                            : 1;
                        const revenue =
                          (actionLast['number'] - actionFirst['number']) /
                          10 ** actionFirst['decimals'];
                        const profit = revenue - fee;
                        const token_address = actionFirst['token_address'];
                        const priceData = await this.makeRequest<any>(
                          `https://price.jup.ag/v4/price?ids=`,
                          token_address,
                        );
                        let mintSymbol = '';
                        let price = 0;
                        for (const key in priceData) {
                          if (priceData.hasOwnProperty(key)) {
                            mintSymbol = priceData[key].mintSymbol;
                            price = priceData[key].price;
                          }
                        }
                        if (
                          this.signers[signer] &&
                          this.signers[signer]['timestamp'] <
                            transaction['trans_time']
                        ) {
                          const txs = this.signers[signer].push(
                            transaction['txHash'],
                          );
                          this.signers[signer] = {
                            timestamp: tx['trans_time'],
                            profit: (this.signers[signer] + profit) * price,
                            token: mintSymbol,
                            transactions: txs,
                            price: price,
                            count: this.signers[signer]['count'] + 1,
                          };
                        } else {
                          this.signers[signer] = {
                            timestamp: tx['trans_time'],
                            profit: profit * price,
                            token: mintSymbol,
                            transactions: [transaction['txHash']],
                            price: price,
                            count: 1,
                          };
                        }
                      }
                      console.log('Transaction fit :', transaction['txHash']);
                      this.sendDataToEndpoint(this.signers);
                      this.saveBotDataToCSV(
                        this.signers,
                        `bot_data_${Date.now()}`,
                      );
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
    console.log(data);
    const endpoint =
      'https://script.google.com/macros/s/AKfycbzIHi6qPw6UyzVmunKjRZpi4Ate8yi5PSxoge_zVYhYTGzcdiZw1v58hdg8ymHdkyhF/exec';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response}`);
      }
      const result = await response.json();
      console.log('Data sent successfully:', result);
    } catch (error) {
      console.error('Error sending data to endpoint:', error);
    }
  }
}
