import { Controller, Get, LoggerService, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { BotService } from './bot/bot.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly botService: BotService,
  ) {}

  @Get()
  async getHello(): Promise<any[]> {
    this.appService.detectBot();
    return [];
  }

  @Get('transaction')
  async getTransaction(
    @Query('blockNumber') blockNumber: number,
  ): Promise<any> {
    console.log('hash');
    this.botService.getData(blockNumber);
    return { enableCrawl: 'true' };
  }
}
