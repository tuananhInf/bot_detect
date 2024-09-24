import { Controller, Get, LoggerService, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { BotService } from './bot/bot.service';
import { ProfitService } from './bot/profit.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly botService: BotService,
    private readonly profitService: ProfitService,
  ) {}

  @Get()
  async getHello(): Promise<[]> {
    this.profitService.crawlProfitBots();
    return [];
  }

  @Get('transaction')
  async getTransaction(
    @Query('blockNumber') blockNumber: string,
  ): Promise<any> {
    console.log('hash');
    this.botService.getData(parseInt(blockNumber));
    return { enableCrawl: 'true' };
  }
}
