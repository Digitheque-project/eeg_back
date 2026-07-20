import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AccueilClientService } from '../eeg/patients/accueil-client.service';
import { ChuClientService } from './clients/chu-client.service';
import { UserClientService } from './clients/user-client.service';
import { PriseEnChargeClientService } from './clients/prise-en-charge-client.service';

const httpModule = HttpModule.register({
  timeout: 5000,
  maxRedirects: 5,
});

@Module({
  imports: [httpModule],
  providers: [
    AccueilClientService,
    ChuClientService,
    UserClientService,
    PriseEnChargeClientService,
  ],
  exports: [
    AccueilClientService,
    ChuClientService,
    UserClientService,
    PriseEnChargeClientService,
    httpModule,
  ],
})
export class CommonModule {}
