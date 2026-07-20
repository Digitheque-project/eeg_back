import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { DemandesService } from '../demandes/demandes.service';
import { ChuClientService } from '../../common/clients/chu-client.service';
import { getErrorMessage } from '../../common/utils/error.util';

@Injectable()
export class EegSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(EegSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly demandesService: DemandesService,
    private readonly chuClient: ChuClientService,
  ) {}

  // Synchronisation immédiate au démarrage, puis en continu via le cron
  // ci-dessous. Fire-and-forget : le service Prescription (Render, tombe en
  // veille) peut mettre plusieurs dizaines de secondes à répondre à froid —
  // ça ne doit jamais retarder le démarrage de l'appli ni son health check.
  onModuleInit() {
    // Vérification au démarrage que EEG_SERVICE_ID pointe bien vers le bon
    // service dans le registre CHU (diagnostic uniquement, fire-and-forget).
    void this.chuClient.getMyServiceInfo().then((info) => {
      if (info) {
        this.logger.log(`Service EEG résolu : "${info.name}" (id=${info.id})`);
      } else {
        this.logger.warn(
          'Service EEG introuvable dans le registre CHU — vérifier EEG_SERVICE_ID',
        );
      }
    });
    void this.synchroniserPrescriptions();
  }

  // ─── Matérialise en local les prescriptions EEG pas encore promues ──
  // Sans ce job, une prescription CREEE non encore ouverte par un
  // technicien n'existe qu'en mémoire côté service Prescription : elle est
  // invisible aux rapports (rapports.controller.ts) et à l'alerte STAT
  // ci-dessous, qui ne portent que sur la table locale.
  @Cron(CronExpression.EVERY_MINUTE)
  async synchroniserPrescriptions() {
    try {
      const nb = await this.demandesService.syncPendingPrescriptions();
      this.logger.log(`Sync prescriptions : ${nb} nouvelle(s) (sur N reçues)`);
    } catch (err) {
      this.logger.warn(
        `Échec de synchronisation des prescriptions: ${getErrorMessage(err)}`,
      );
    }
  }

  // ─── Alerte EN_COURS non interprété > 24h ──────────────────────────
  @Cron(CronExpression.EVERY_HOUR)
  async alerterExamensNonInterpretes() {
    const il_y_a_24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nonInterpretes = await this.prisma.eegDemande.findMany({
      where: {
        statut: 'EN_COURS',
        dateRealisation: { lte: il_y_a_24h },
      },
    });
    for (const demande of nonInterpretes) {
      const dejaNotifie = await this.prisma.eegNotification.findFirst({
        where: { demandeId: demande.id, type: 'ALERTE_URGENTE', lu: false },
      });
      if (!dejaNotifie) {
        const patient = await this.patientLookup.getPatientInfo(
          demande.patientId,
        );
        await this.prisma.eegNotification.create({
          data: {
            niveau: 'URGENTE',
            type: 'ALERTE_URGENTE',
            titre: 'Examen non interprété depuis 24h',
            message: `${demande.numeroEEG} (${patient.nom}) réalisé depuis >24h sans interprétation.`,
            demandeId: demande.id,
            patientId: demande.patientId,
          },
        });
      }
    }
  }

  // ─── Alerte STAT non réalisé > 30 min ──────────────────────────────
  @Cron(CronExpression.EVERY_5_MINUTES)
  async alerterStatNonRealises() {
    const il_y_a_30min = new Date(Date.now() - 30 * 60 * 1000);
    const statEnAttente = await this.prisma.eegDemande.findMany({
      where: {
        urgence: 'STAT',
        statut: 'CREEE',
        dateCreation: { lte: il_y_a_30min },
      },
    });
    for (const demande of statEnAttente) {
      const dejaNotifie = await this.prisma.eegNotification.findFirst({
        where: { demandeId: demande.id, type: 'ALERTE_CRITIQUE', lu: false },
      });
      if (!dejaNotifie) {
        const patient = await this.patientLookup.getPatientInfo(
          demande.patientId,
        );
        await this.prisma.eegNotification.create({
          data: {
            niveau: 'STAT',
            type: 'ALERTE_CRITIQUE',
            titre: 'STAT non réalisé depuis 30 min',
            message: `${demande.numeroEEG} (${patient.nom}) STAT en attente depuis >30min.`,
            demandeId: demande.id,
            patientId: demande.patientId,
          },
        });
      }
    }
  }
}
