import { ExternalModule } from './external/external.module';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DemandesController } from './demandes/demandes.controller';
import { DemandesService } from './demandes/demandes.service';
import { ResultatsController } from './resultats/resultats.controller';
import { ResultatsService } from './resultats/resultats.service';
import { RapportsController } from './rapports/rapports.controller';
import { ArchivesController } from './archives/archives.controller';
import { AuditController } from './audit/audit.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { RdvsController } from './rdvs/rdvs.controller';
import { PatientsController } from './patients/patients.controller';
import { EegSchedulerService } from './jobs/eeg-scheduler.service';
import { CommonModule } from '../common/common.module';
import { AuthController } from './auth/auth.controller';
import { PersonnelServiceController } from './config/personnel-service.controller';
import { PersonnelServiceService } from './config/personnel-service.service';

@Module({
  imports: [ExternalModule, CommonModule, ScheduleModule.forRoot()],
  controllers: [
    AuthController,
    DemandesController,
    ResultatsController,
    RapportsController,
    ArchivesController,
    AuditController,
    NotificationsController,
    RdvsController,
    PatientsController,
    PersonnelServiceController,
  ],
  providers: [
    DemandesService,
    ResultatsService,
    EegSchedulerService,
    PersonnelServiceService,
  ],
})
export class EegModule {}
