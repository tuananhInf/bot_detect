import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { BotService } from './bot/bot.service';
import { ProfitService } from './bot/profit.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService, BotService, ProfitService],
})
export class AppModule {}
