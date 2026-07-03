import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NotificationExternalService } from './notification-external.service';
import { ExternalPrescriptionService } from './external-prescription.service';
import { ExternalPrescriptionController } from './external-prescription.controller';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { AccueilClientService } from '../patients/accueil-client.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChuClientService } from '../../common/clients/chu-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    PrismaModule,
  ],
  providers: [NotificationExternalService, ExternalPrescriptionService, PatientLookupService, AccueilClientService, ChuClientService],
  controllers: [ExternalPrescriptionController],
  exports: [NotificationExternalService, ExternalPrescriptionService, PatientLookupService, AccueilClientService, ChuClientService],
})
export class ExternalModule {}
