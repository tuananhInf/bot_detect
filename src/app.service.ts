import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Cron } from '@nestjs/schedule';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
interface BotData {
  bot_id: string;
  tx_hash: string;
  profit: number;
  token_name: string;
}
@Injectable()
export class AppService {
  private baseUrl: string = 'https://api-v2.solscan.io/v2';
  private config: AxiosRequestConfig;
  private transactionBots = [];
  private timeStart: number;
  private timeEnd: number;
  private i = 0;
  constructor() {
    this.timeStart = Date.now(); // Thời điểm hiện tại
    this.timeEnd = this.timeStart + 24 * 60 * 60 * 1000; // 24 giờ sau đó
  }

  getRandomIp(filePath: string): string {
    try {
      // Đọc nội dung của file
      const fileContent: string = fs.readFileSync(filePath, 'utf-8');

      // Tách nội dung thành mảng các dòng
      const lines: string[] = fileContent
        .split('\n')
        .filter((line) => line.trim() !== '');

      // Kiểm tra xem có dòng nào không
      if (lines.length === 0) {
        throw new Error('File is empty');
      }

      // Chọn ngẫu nhiên một dòng
      const randomIndex: number = Math.floor(Math.random() * lines.length);
      return lines[randomIndex].trim();
    } catch (error) {
      console.error('Error reading file:', error);
      return '';
    }
  }

  private async makeRequest<T>(url: string, param: string): Promise<T> {
    const maxRetries = 300;
    let retries = 0;
    this.config = {};
    this.i = this.i + 1;
    console.log('request time:', this.i);
    while (retries < maxRetries) {
      try {
        this.config.timeout = 50000;
        // const ip = this.getRandomIp('list_ip.txt');
        const proxy = `http://diemmy889980:gfH7y83JrjC7zrw8_country-UnitedStates@proxy.packetstream.io:31112`;
        const httpAgent = new HttpProxyAgent(proxy);
        const httpsAgent = new HttpsProxyAgent(proxy);
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
          const response = await axios({
            url: url + param,
            ...config,
            httpAgent,
            httpsAgent,
            method: 'GET',
          });
          return response.data.data;
        } catch (error) {
          throw error;
        }
        // try {
        //   const apikey = 'fed3021a09dbf0c707a2c5c4a4e667a4c18efc05';
        //   const response = await axios.get('https://api.zenrows.com/v1/', {
        //     params: {
        //       url: url + param,
        //       apikey: apikey,
        //       js_render: 'true',
        //       js_instructions: `[{"click":".selector"},{"wait":500},{"fill":[".input","value"]},{"wait_for":".slow_selector"}]`,
        //       autoparse: 'true',
        //     },
        //   });
        //   console.log('data', response.data.data);
        //   return response.data.data;
        // } catch (error) {
        //   throw error;
        // }
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
    console.log('get block last');
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

  saveBotDataToCSV(
    data: BotData[],
    fileName: string = 'bot_data',
    folderName: string = '.',
  ): void {
    // Đảm bảo fileName có đuôi .csv
    const fileNameWithExtension = fileName.endsWith('.csv')
      ? fileName
      : `${fileName}.csv`;

    // Tạo header cho file CSV
    const header = 'bot_id,tx_hash,profit,token_name\n';

    const csvContent = data.reduce((acc, transaction) => {
      return (
        acc +
        `${transaction.bot_id},${transaction.tx_hash},${transaction.profit},${transaction.token_name}\n`
      );
    }, header);

    // Tạo đường dẫn đầy đủ cho thư mục và file
    const directory = path.join(process.cwd(), folderName);
    const filePath = path.join(directory, fileNameWithExtension);

    // Kiểm tra và tạo thư mục nếu nó không tồn tại
    if (!fs.existsSync(directory)) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        console.log(`Directory created: ${directory}`);
      } catch (error) {
        console.error(`Error creating directory: ${error}`);
        return; // Kết thúc quá trình nếu không thể tạo thư mục
      }
    }

    try {
      // Ghi dữ liệu vào file
      fs.writeFileSync(filePath, csvContent, 'utf-8');
      console.log(`CSV file has been saved to ${filePath}`);
    } catch (error) {
      console.error(`Error writing file: ${error}`);
    }
  }

  // @Cron('0 */9 * * * *')
  async detectBot(): Promise<any> {
    const timeCurent = Date.now();
    if (timeCurent > this.timeEnd) {
      this.saveBotDataToCSV(
        this.transactionBots,
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
                        let check = true;
                        for (const transactionSaved of this.transactionBots) {
                          if (
                            transactionSaved['tx_hash'] ===
                            transaction['txHash']
                          ) {
                            check = false;
                          }
                        }
                        if (check) {
                          this.transactionBots.push({
                            bot_id: signer,
                            profit: profit * price,
                            tx_hash: transaction['txHash'],
                            token_name: mintSymbol,
                          });
                        }
                      }
                      console.log('Transaction fit :', transaction['txHash']);
                      // this.sendDataToEndpoint(this.transactionBots);
                      this.saveBotDataToCSV(
                        this.transactionBots,
                        `transaction_bot_${Date.now()}`,
                        'data_detect_bot',
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
