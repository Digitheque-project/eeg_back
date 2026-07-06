import { Module } from '@nestjs/common';
import { NotificationExternalService } from './notification-external.service';
import { ExternalPrescriptionService } from './external-prescription.service';
import { ExternalPrescriptionController } from './external-prescription.controller';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [NotificationExternalService, ExternalPrescriptionService, PatientLookupService],
  controllers: [ExternalPrescriptionController],
  exports: [NotificationExternalService, ExternalPrescriptionService, PatientLookupService],
})
export class ExternalModule {}
