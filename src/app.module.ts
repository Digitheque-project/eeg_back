import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { EegModule } from './eeg/eeg.module';

@Module({
  imports: [
    PrismaModule,
    EegModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
