import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
const THRESHOLD = 1 / 10 ** 9;
@Injectable()
export class BotService {
  private connection: Connection;
  private blockLatestNumber;
  private block;
  private bot_data;
  private indexRpc = 0;
  private accountsJito = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  ];
  private rpcList = [
    'https://rpc.shyft.to?api_key=zNhEkWKYEEQeNNMB',
    'https://api.mainnet-beta.solana.com',
    'https://mainnet.helius-rpc.com/?api-key=89228179-52e3-4225-9935-5c0aff6b201e',
    'https://go.getblock.io/2847bf1e519d4012ae8a87c0c8334bcf',
    'https://solana-mainnet.core.chainstack.com/d80741f7e9bab337cd1dd31bd1ee6907',
    'https://solana-api.instantnodes.io/token-slriOX8sM62kMJD4G50WTOdFRJdI04ro',
  ];
  constructor() {
    this.bot_data = [];
  }
  async getTransaction(
    hash: string,
  ): Promise<ParsedTransactionWithMeta | null> {
    try {
      return await this.connection.getParsedTransaction(hash, {
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return null;
    }
  }

  async getSigners(transaction: any) {
    const signers = [];
    const accountKeys = transaction?.transaction?.accountKeys;
    if (accountKeys?.length > 0) {
      for (const accountKey of accountKeys) {
        if (accountKey['signer'] === true) {
          signers.push(accountKey['pubkey'].toString());
        }
      }
    }

    return signers;
  }

  async getBalanceChange(transaction: any) {
    const preTokenBalances = transaction['meta']['preTokenBalances'];
    const postTokenBalances = transaction['meta']['postTokenBalances'];
    const balanceChange = [];
    let signer;
    const signers = await this.getSigners(transaction);
    let checkArb = 0;
    let checkTokenSwap = 0;
    for (let i = 0; i < preTokenBalances.length; i++) {
      if (signers.includes(preTokenBalances[i]['owner'])) {
        if (
          parseFloat(postTokenBalances[i]?.uiTokenAmount?.amount) ===
            parseFloat(preTokenBalances[i]?.uiTokenAmount?.amount) &&
          parseFloat(postTokenBalances[i]?.uiTokenAmount?.amount) == 0
        ) {
          break;
        }
        const change =
          (parseFloat(postTokenBalances[i]?.uiTokenAmount?.amount) -
            parseFloat(preTokenBalances[i]?.uiTokenAmount?.amount)) /
          10 ** preTokenBalances[i]?.uiTokenAmount?.decimals;
        if (change >= 0) {
          const tokenSwaps = [
            'So11111111111111111111111111111111111111112',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          ];
          if (tokenSwaps.includes(postTokenBalances[i]?.mint)) {
            checkTokenSwap = 1;
          }
          checkArb++;
          if (change > 0) {
            balanceChange.push({
              value: change,
              token: postTokenBalances[i]?.mint,
            });
          }

          signer = preTokenBalances[i]['owner'];
        } else {
          return { signer: null, balanceChange: [] };
        }
      }
    }
    if (checkArb > 1 && checkTokenSwap == 1) {
      return { signer, balanceChange: balanceChange };
    }
    return { signer: null, balanceChange: balanceChange };
  }

  async getTotalFees(
    transaction: any,
    accounts: any[],
    preBalances: any[],
    postBalances: any[],
    signer,
  ) {
    const fee = transaction['meta']['fee'];
    let jitoFee = 0;
    let balanceSol = 0;
    for (let i = 0; i < accounts.length; i++) {
      if (this.accountsJito.includes(accounts[i]['pubkey'].toString())) {
        jitoFee += postBalances[i] / 10 ** 9 - preBalances[i] / 10 ** 9;
      }
      if (accounts[i]['pubkey'].toString() === signer) {
        balanceSol = postBalances[i] / 10 ** 9 - preBalances[i] / 10 ** 9;
      }
    }
    const totalFee = fee / 10 ** 9 + jitoFee;
    return { balanceSol, totalFee };
  }

  async getBlock(blockNumber: number): Promise<any> {
    try {
      const block = await this.connection.getBlock(blockNumber, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'accounts',
        commitment: 'confirmed',
      });
      return { block: block };
    } catch (e) {
      console.log('e', e);
      throw e;
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      const header = 'bot_id,tx_hash,fee\n';
      fs.writeFileSync(filePath, header, 'utf-8');
    }

    // Tạo dòng dữ liệu mới
    const newRow = `${data.bot_id},${data.tx_hash},${data.fee}\n`;

    // Thêm dòng mới vào cuối file
    fs.appendFileSync(filePath, newRow, 'utf-8');
  }

  getConnect() {
    const rpc = this.rpcList[this.indexRpc % this.rpcList.length];
    this.indexRpc++;
    return rpc;
  }

  saveJsonFile(filename, data) {
    return new Promise<void>((resolve, reject) => {
      // Đọc file hiện có hoặc tạo một mảng trống nếu file không tồn tại
      let existingData = [];
      if (fs.existsSync(filename)) {
        const fileContent = fs.readFileSync(filename, 'utf8');
        existingData = JSON.parse(fileContent);
      }

      // Thêm dữ liệu mới vào mảng
      existingData.push(data);

      // Ghi lại toàn bộ mảng vào file
      const jsonData = JSON.stringify(existingData, null, 2);
      fs.writeFile(filename, jsonData, 'utf8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // @Cron('*/1 * * * * *')
  async getData(blockOldNumber?) {
    if (!blockOldNumber) {
      blockOldNumber = 289383128;
    }

    let i = 0;
    while (true) {
      try {
        console.log('Number block', i++);
        let block;
        let countGetConnect = 0;
        while (true) {
          try {
            const rpc = this.getConnect();
            this.connection = new Connection(rpc);
            console.log('rpc', rpc);
            const result = await this.getBlock(blockOldNumber);
            block = result.block;
            break;
          } catch (e) {
            if (countGetConnect === this.rpcList.length) {
              break;
            }
            countGetConnect++;
            console.log('Again get connect');
          }
        }

        blockOldNumber += 1;
        const startTime = Date.now();
        for (const transaction of block['transactions']) {
          try {
            const accounts = transaction?.transaction?.accountKeys;
            const signers = await this.getSigners(transaction);
            if (
              transaction?.meta?.err != null ||
              (transaction?.meta?.postTokenBalances?.length == 0 &&
                transaction?.meta?.preTokenBalances?.length == 0) ||
              signers?.length == 0 ||
              accounts?.length == 0
            ) {
              continue;
            }
            const { signer, balanceChange } =
              await this.getBalanceChange(transaction);
            if (!signer) {
              continue;
            }
            const { balanceSol, totalFee } = await this.getTotalFees(
              transaction,
              accounts,
              transaction.meta.preBalances,
              transaction.meta.postBalances,
              signer,
            );

            if (balanceSol + totalFee > THRESHOLD) {
              continue;
            }
            const txHash = transaction?.transaction?.signatures[0];
            if (signer && balanceChange.length > 0) {
              const newData = {
                bot_id: signer,
                tx_hash: txHash,
                profit: balanceChange,
                fee: totalFee,
              };
              this.saveBotDataToCSV(newData);
              await this.saveJsonFile('bot_data_profit.json', newData);
            }
          } catch (e) {
            console.log(e);
          }
        }
        const endTime = Date.now();
        console.log('Duration : ', endTime - startTime);
        await this.sleep(5000);
      } catch (e) {
        console.log(e);
      }
    }
  }
}
