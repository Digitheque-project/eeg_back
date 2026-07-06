import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AccueilClientService } from '../eeg/patients/accueil-client.service';
import { ChuClientService } from './clients/chu-client.service';

const httpModule = HttpModule.register({
  timeout: 5000,
  maxRedirects: 5,
});

@Module({
  imports: [httpModule],
  providers: [AccueilClientService, ChuClientService],
  exports: [AccueilClientService, ChuClientService, httpModule],
})
export class CommonModule {}
