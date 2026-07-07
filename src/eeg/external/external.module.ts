import { Module } from '@nestjs/common';
import { NotificationExternalService } from './notification-external.service';
import { PrescriptionClientService } from './prescription-client.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [
    NotificationExternalService,
    PrescriptionClientService,
    PatientLookupService,
  ],
  exports: [
    NotificationExternalService,
    PrescriptionClientService,
    PatientLookupService,
  ],
})
export class ExternalModule {}
