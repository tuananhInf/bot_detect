import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { retry } from 'rxjs';
interface IBalanceInfo {
  Txhash: string;
  BlockTimeUnix: string;
  BlockTime: string;
  'Fee(SOL)': string;
  TokenAccount: string;
  ChangeType: string;
  ChangeAmount: string;
  PreBalancer: string;
  PostBalancer: string;
  TokenAddress: string;
  TokenDecimals: string;
}
@Injectable()
export class ProfitService {
  private priceCache = new Map<string, number>();
  private botIds: string[] = [];
  constructor() {}

  async getPrice(token_address) {
    let retry = 10;
    while (retry > 0) {
      try {
        const proxy = `http://diemmy889980:gfH7y83JrjC7zrw8_country-UnitedStates@proxy.packetstream.io:31112`;
        const httpAgent = new HttpProxyAgent(proxy);
        const httpsAgent = new HttpsProxyAgent(proxy);
        const result = await axios.get(
          `https://price.jup.ag/v4/price?ids=${token_address}`,
        );
        const priceData = result.data.data;
        let price = 0;
        for (const key in priceData) {
          if (priceData.hasOwnProperty(key)) {
            price = priceData[key].price;
          }
        }
        this.priceCache.set(token_address, price);
        return price;
      } catch (e) {
        retry -= 1;
        console.log(e);
      }
    }
  }

  saveBotDataToCSV(
    data: any,
    fileName: string = 'bot_data',
    folderName: string = 'data_detect',
  ): void {
    // Đảm bảo fileName có đuôi .csv
    const fileNameWithExtension = fileName.endsWith('.csv')
      ? fileName
      : `${fileName}.csv`;
    const directory = path.join(process.cwd(), folderName);
    const filePath = path.join(directory, fileNameWithExtension);

    // Tạo thư mục nếu nó không tồn tại
    if (!fs.existsSync(directory)) {
      try {
        fs.mkdirSync(directory, { recursive: true });
      } catch (error) {
        console.error(`Error creating directory: ${error}`);
        return;
      }
    }

    // Tạo file với header nếu nó chưa tồn tại
    if (!fs.existsSync(filePath)) {
      const header = 'bot_id,block_time,timestamp,tx_hash,amount_change\n';
      fs.writeFileSync(filePath, header, 'utf-8');
    }

    // Tạo dòng dữ liệu mới
    const newRow = `${data.bot_id},${data.block_time},${data.timestamp},${data.tx_hash},${data.amount_change}\n`;

    // Thêm dòng mới vào cuối file
    fs.appendFileSync(filePath, newRow, 'utf-8');
  }

  async sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async getBalanceChangeBot(
    startTime: number,
    endTime: number,
    address: string,
  ): Promise<IBalanceInfo[]> {
    let retry = 10;
    while (retry > 0) {
      try {
        const proxy = `http://diemmy889980:gfH7y83JrjC7zrw8_country-UnitedStates@proxy.packetstream.io:31112`;
        const httpAgent = new HttpProxyAgent(proxy);
        const httpsAgent = new HttpsProxyAgent(proxy);
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        const url = `https://api-v2.solscan.io/v2/account/balance_change/export?address=${address}&block_time[]=${startTime}&block_time[]=${endTime}`;
        const result = await axios.get(url);
        return this.csvStringToJson(result.data);
      } catch (e) {
        retry -= 1;
        await this.sleep(2000);
        console.log(e);
      }
    }
  }

  csvStringToJson(csvString: string): any[] {
    // Tách các dòng
    const lines = csvString.trim().split('\n');

    // Lấy tiêu đề (giả sử dòng đầu tiên là tiêu đề)
    const headers = lines[0].split(',').map((header) => header.trim());

    // Chuyển đổi các dòng còn lại thành đối tượng JSON
    const jsonArray = lines.slice(1).map((line) => {
      const values = line.split(',');
      const obj: { [key: string]: string } = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] ? values[index].trim() : '';
      });
      return obj;
    });

    return jsonArray;
  }

  async getDataPerBot(botId: string, startTime: number, endTime: number) {
    console.log('getDataPerBot:', botId);

    let resultGetBalance = await this.getBalanceChangeBot(
      startTime,
      endTime,
      botId,
    );
    let endTimeUpdate = 0;
    let checkExcept = 10;
    while (true) {
      try {
        if (checkExcept <= 0) {
          break;
        }
        if (Array.isArray(resultGetBalance) && resultGetBalance.length > 0) {
          for (const balanceInfo of resultGetBalance) {
            if (parseInt(balanceInfo.BlockTimeUnix) < startTime) {
              break;
            } else {
              const amountChange =
                parseInt(balanceInfo.ChangeAmount) /
                10 ** parseInt(balanceInfo.TokenDecimals);
              let price = 1;
              if (this.priceCache.get(balanceInfo.TokenAddress)) {
                price = this.priceCache.get(balanceInfo.TokenAddress);
              } else {
                price = await this.getPrice(balanceInfo.TokenAddress);
              }
              const botProfit = {
                bot_id: botId,
                block_time: balanceInfo.BlockTime,
                timestamp: balanceInfo.BlockTimeUnix,
                tx_hash: balanceInfo.Txhash,
                amount_change:
                  balanceInfo.ChangeType === 'inc'
                    ? amountChange * price
                    : -1 * amountChange * price,
              };
              console.log(
                'Percent: ',
                ((parseInt(balanceInfo.BlockTimeUnix) - endTime) * 100) /
                  (1726553363 - endTime),
              );
              this.saveBotDataToCSV(botProfit, 'txn_bot_new', 'profit');
              endTimeUpdate = parseInt(balanceInfo.BlockTimeUnix);
            }
          }
          resultGetBalance = await this.getBalanceChangeBot(
            startTime,
            endTimeUpdate - 1,
            botId,
          );
          if (resultGetBalance.length <= 0) {
            return 'Done';
          }
        }
      } catch (e) {
        checkExcept++;
        console.log(e);
      }
    }
    return 'Done';
  }

  extractFirstColumnFromFile(filePath: string): string[] {
    // Đọc nội dung của file CSV
    const csvContent = fs.readFileSync(filePath, 'utf-8');

    // Tách các dòng
    const lines = csvContent.trim().split('\n');

    // Trích xuất giá trị đầu tiên từ mỗi dòng
    const firstColumnValues = lines.map((line) => {
      const columns = line.split(',');
      return columns[0].trim();
    });

    return firstColumnValues;
  }

  async crawlProfitBots() {
    try {
      const startTime = 1726553363;
      const endTime = 1727150884;
      const bots = this.extractFirstColumnFromFile('result_check_bots.csv');
      // const bots = ['ARsCio3rdTWmiLiK9aCYKxEjQQ3zQpHHvDZhbabPRzfA'];
      const promises = bots.map(async (botId) => {
        const start = Date.now();
        const res = await this.getDataPerBot(botId, startTime, endTime);
        const duration = Date.now() - start;
        console.log('Duration of block: ', duration);
        console.log(`Profit bot : ${botId} saved`);
        return { botId, res, duration };
      });

      const results = await Promise.all(promises);
      console.log('All bots processed:', results);
    } catch (e) {
      console.log(e);
    }
  }
}
