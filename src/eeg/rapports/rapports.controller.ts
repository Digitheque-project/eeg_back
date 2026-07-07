import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { AccueilClientService } from '../patients/accueil-client.service';

// Seuil retenu pour distinguer enfant / adulte dans les statistiques du
// service (confirmé avec le major de service).
const SEUIL_ENFANT_ANS = 18;

@ApiTags('Rapports')
@Controller('eeg/rapports')
export class RapportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly accueilClient: AccueilClientService,
  ) {}

  // Construit le filtre de période commun à tous les rapports — permet de
  // basculer entre vue hebdomadaire, mensuelle ou toute autre période
  // personnalisée depuis le même mécanisme dateDebut/dateFin.
  private buildPeriodeWhere(
    dateDebut?: string,
    dateFin?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!dateDebut && !dateFin) return undefined;
    const filtre: Prisma.DateTimeFilter = {};
    if (dateDebut) filtre.gte = new Date(dateDebut);
    if (dateFin) {
      const fin = new Date(dateFin);
      fin.setHours(23, 59, 59, 999);
      filtre.lte = fin;
    }
    return filtre;
  }

  @Get('activite')
  @ApiOperation({ summary: 'Volumes des demandes EEG' })
  @ApiQuery({
    name: 'dateDebut',
    required: false,
    description: 'YYYY-MM-DD — pour une vue hebdomadaire ou mensuelle',
  })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  async getActivite(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    const periode = this.buildPeriodeWhere(dateDebut, dateFin);
    const where: Prisma.EegDemandeWhereInput = periode
      ? { dateCreation: periode }
      : {};

    const [recues, traitees, acceptees, annulees, enAttente] =
      await Promise.all([
        this.prisma.eegDemande.count({ where }),
        this.prisma.eegDemande.count({
          where: { ...where, statut: 'RESULTAT_DISPONIBLE' },
        }),
        // Acceptées = le technicien a donné suite (planifiée, réalisée ou
        // archivée) — le pendant direct des refusées/annulées ci-dessous.
        this.prisma.eegDemande.count({
          where: {
            ...where,
            statut: { in: ['PLANIFIEE', 'EN_COURS', 'RESULTAT_DISPONIBLE'] },
          },
        }),
        this.prisma.eegDemande.count({
          where: { ...where, statut: 'ANNULEE' },
        }),
        this.prisma.eegDemande.count({
          where: {
            ...where,
            statut: { in: ['CREEE', 'PLANIFIEE', 'EN_COURS'] },
          },
        }),
      ]);
    return { recues, traitees, acceptees, annulees, enAttente };
  }

  @Get('delais')
  @ApiOperation({ summary: 'Délais moyens de traitement' })
  @ApiQuery({
    name: 'dateDebut',
    required: false,
    description: 'YYYY-MM-DD — pour une vue hebdomadaire ou mensuelle',
  })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  async getDelais(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    const periode = this.buildPeriodeWhere(dateDebut, dateFin);
    const demandes = await this.prisma.eegDemande.findMany({
      where: {
        dateValidation: { not: null },
        ...(periode ? { dateCreation: periode } : {}),
      },
      select: { dateCreation: true, dateValidation: true },
    });
    const delaisTraitement = demandes
      .filter((d) => d.dateValidation)
      .map(
        (d) =>
          (d.dateValidation!.getTime() - d.dateCreation.getTime()) / 1000 / 60,
      );
    const moyenne = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      delaiMoyenTraitementMinutes: Math.round(moyenne(delaisTraitement)),
      nombreDemandes: demandes.length,
    };
  }

  @Get('demographie')
  @ApiOperation({
    summary: "Répartition démographique — sexe, âge, type d'examen",
    description:
      "Chiffres calculés uniquement sur les patients ayant réellement passé un examen EEG (statut EN_COURS ou RESULTAT_DISPONIBLE) — une prescription refusée ou seulement planifiée n'est pas comptée, car le patient n'est pas encore passé dans le service. Croisé avec les données patient d'Accueil (récupérées en un seul appel). Filtrable par période pour couvrir un rapport hebdomadaire, mensuel ou personnalisé.",
  })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  async getDemographie(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    // Ne compte que les patients réellement passés dans le service EEG :
    // examen réalisé (EN_COURS) ou résultat archivé (RESULTAT_DISPONIBLE).
    // Une demande simplement créée, planifiée ou refusée/annulée ne
    // représente pas un passage réel et ne doit pas gonfler ces chiffres.
    const periode = this.buildPeriodeWhere(dateDebut, dateFin);
    const where: Prisma.EegDemandeWhereInput = {
      statut: { in: ['EN_COURS', 'RESULTAT_DISPONIBLE'] },
      ...(periode ? { dateCreation: periode } : {}),
    };

    const [demandes, patients] = await Promise.all([
      this.prisma.eegDemande.findMany({
        where,
        select: { patientId: true, typeEEG: true, statut: true },
      }),
      this.accueilClient.listPatients(),
    ]);

    const patientParId = new Map(patients.map((p) => [p.id, p]));
    const patientsDistincts = new Set(demandes.map((d) => d.patientId));

    let garcons = 0;
    let filles = 0;
    let sexeInconnu = 0;
    let enfants = 0;
    let adultes = 0;
    let ageInconnu = 0;

    for (const patientId of patientsDistincts) {
      const patient = patientParId.get(patientId);
      if (patient?.sexe === 'M') garcons++;
      else if (patient?.sexe === 'F') filles++;
      else sexeInconnu++;

      if (patient?.age != null) {
        if (patient.age < SEUIL_ENFANT_ANS) enfants++;
        else adultes++;
      } else {
        ageInconnu++;
      }
    }

    const parTypeEEG: Record<string, number> = {};
    for (const d of demandes) {
      parTypeEEG[d.typeEEG] = (parTypeEEG[d.typeEEG] ?? 0) + 1;
    }

    return {
      examensRealises: demandes.length,
      totalPatients: patientsDistincts.size,
      patientsTraites: demandes.filter(
        (d) => d.statut === 'RESULTAT_DISPONIBLE',
      ).length,
      sexe: { garcons, filles, inconnu: sexeInconnu },
      age: {
        enfants,
        adultes,
        inconnu: ageInconnu,
        seuilEnfantAns: SEUIL_ENFANT_ANS,
      },
      parTypeEEG,
    };
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'Résultats critiques' })
  async getAnomalies() {
    const resultats = await this.prisma.eegResultat.findMany({
      where: { estCritique: true },
      include: {
        demande: {
          select: {
            numeroEEG: true,
            statut: true,
            patientId: true,
          },
        },
      },
      orderBy: { dateValidation: 'desc' },
    });

    return Promise.all(
      resultats.map(async (r) => {
        const patient = await this.patientLookup.getPatientInfo(
          r.demande.patientId,
        );
        return { ...r, demande: { ...r.demande, patient } };
      }),
    );
  }
}
