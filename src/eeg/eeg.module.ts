import { ExternalModule } from "./external/external.module";
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

@Module({
  imports: [ExternalModule, CommonModule, ScheduleModule.forRoot()],
  controllers: [
    DemandesController,
    ResultatsController,
    RapportsController,
    ArchivesController,
    AuditController,
    NotificationsController,
    RdvsController,
    PatientsController,
  ],
  providers: [
    DemandesService,
    ResultatsService,
    EegSchedulerService,
  ],
})
export class EegModule {}
