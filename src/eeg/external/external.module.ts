import { Module } from '@nestjs/common';
import { NotificationExternalService } from './notification-external.service';
import { PrescriptionClientService } from './prescription-client.service';
import { UploadClientService } from './upload-client.service';
import { DossierPatientClientService } from './dossier-patient-client.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [
    NotificationExternalService,
    PrescriptionClientService,
    UploadClientService,
    DossierPatientClientService,
    PatientLookupService,
  ],
  exports: [
    NotificationExternalService,
    PrescriptionClientService,
    UploadClientService,
    DossierPatientClientService,
    PatientLookupService,
  ],
})
export class ExternalModule {}
