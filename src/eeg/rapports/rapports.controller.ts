import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Rapports')
@Controller('eeg/rapports')
export class RapportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('activite')
  @ApiOperation({ summary: 'Volumes des demandes EEG' })
  async getActivite() {
    const [recues, traitees, annulees, enAttente] = await Promise.all([
      this.prisma.eegDemande.count(),
      this.prisma.eegDemande.count({ where: { statut: 'ACK_RECU' } }),
      this.prisma.eegDemande.count({ where: { statut: 'ANNULEE' } }),
      this.prisma.eegDemande.count({
        where: {
          statut: { in: ['CREEE', 'VALIDEE', 'PLANIFIEE', 'EN_COURS', 'EN_INTERPRETATION'] },
        },
      }),
    ]);
    return { recues, traitees, annulees, enAttente };
  }

  @Get('delais')
  @ApiOperation({ summary: 'Délais moyens de traitement' })
  async getDelais() {
    const demandes = await this.prisma.eegDemande.findMany({
      where: { dateValidation: { not: null } },
      select: { dateCreation: true, dateValidation: true, dateAck: true },
    });
    const delaisTraitement = demandes
      .filter((d) => d.dateValidation)
      .map((d) => (d.dateValidation!.getTime() - d.dateCreation.getTime()) / 1000 / 60);
    const delaisAck = demandes
      .filter((d) => d.dateAck && d.dateValidation)
      .map((d) => (d.dateAck!.getTime() - d.dateValidation!.getTime()) / 1000 / 60);
    const moyenne = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      delaiMoyenTraitementMinutes: Math.round(moyenne(delaisTraitement)),
      delaiMoyenAckMinutes: Math.round(moyenne(delaisAck)),
      nombreDemandes: demandes.length,
    };
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'Résultats critiques non ACK' })
  async getAnomalies() {
    return this.prisma.eegResultat.findMany({
      where: { estCritique: true },
      include: {
        demande: {
          select: {
            numeroEEG: true, statut: true, dateAck: true,
            patient: { select: { nom: true, prenom: true } },
          },
        },
      },
      orderBy: { dateValidation: 'desc' },
    });
  }
}
