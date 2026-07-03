import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutDemande } from '@prisma/client';

@Injectable()
export class EegSchedulerService {
  private readonly logger = new Logger(EegSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Relance ACK toutes les 5 min ──────────────────────────────────
  @Cron(CronExpression.EVERY_5_MINUTES)
  async relancerACKNonRecus() {
    this.logger.log('⏰ Vérification des résultats sans ACK...');
    const sansAck = await this.prisma.eegDemande.findMany({
      where: { statut: 'RESULTAT_DISPONIBLE' },
      include: { patient: true },
    });
    for (const demande of sansAck) {
      const dejaNotifie = await this.prisma.eegNotification.findFirst({
        where: { demandeId: demande.id, lu: false, type: 'RAPPORT' },
      });
      if (!dejaNotifie) {
        await this.prisma.eegNotification.create({
          data: {
            niveau: demande.urgence,
            type: 'RAPPORT',
            titre: 'Relance — ACK en attente',
            message: `Résultat de ${demande.numeroEEG} (${demande.patient.nom} ${demande.patient.prenom}) non accusé.`,
            demandeId: demande.id,
            patientId: demande.patientId,
            assigneeUserId: demande.prescripteurId,
          },
        });
      }
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
      include: { patient: true },
    });
    for (const demande of nonInterpretes) {
      const dejaNotifie = await this.prisma.eegNotification.findFirst({
        where: { demandeId: demande.id, type: 'ALERTE_URGENTE', lu: false },
      });
      if (!dejaNotifie) {
        await this.prisma.eegNotification.create({
          data: {
            niveau: 'URGENTE',
            type: 'ALERTE_URGENTE',
            titre: 'Examen non interprété depuis 24h',
            message: `${demande.numeroEEG} (${demande.patient.nom}) réalisé depuis >24h sans interprétation.`,
            demandeId: demande.id,
            patientId: demande.patientId,
            assigneeUserId: 'med-00000000-0000-0000-0000-000000000001',
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
      include: { patient: true },
    });
    for (const demande of statEnAttente) {
      const dejaNotifie = await this.prisma.eegNotification.findFirst({
        where: { demandeId: demande.id, type: 'ALERTE_CRITIQUE', lu: false },
      });
      if (!dejaNotifie) {
        await this.prisma.eegNotification.create({
          data: {
            niveau: 'STAT',
            type: 'ALERTE_CRITIQUE',
            titre: 'STAT non réalisé depuis 30 min',
            message: `${demande.numeroEEG} (${demande.patient.nom}) STAT en attente depuis >30min.`,
            demandeId: demande.id,
            patientId: demande.patientId,
            assigneeUserId: 'med-00000000-0000-0000-0000-000000000001',
          },
        });
      }
    }
  }
}
