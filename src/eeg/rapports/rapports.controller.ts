import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { AccueilClientService } from '../patients/accueil-client.service';

// Seuil retenu pour distinguer enfant / adulte dans les statistiques du
// service (confirmé avec le major de service).
const SEUIL_ENFANT_ANS = 18;

type SexeFilter = 'M' | 'F';
type StatutFilter =
  | 'CREEE'
  | 'PLANIFIEE'
  | 'EN_COURS'
  | 'RESULTAT_DISPONIBLE'
  | 'ANNULEE';
type UrgenceFilter = 'STAT' | 'URGENTE' | 'NORMALE';

@ApiTags('Rapports')
@Controller('eeg/rapports')
export class RapportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly accueilClient: AccueilClientService,
  ) {}

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

  private buildBaseWhere(
    dateDebut?: string,
    dateFin?: string,
    urgence?: UrgenceFilter,
  ): Prisma.EegDemandeWhereInput {
    const where: Prisma.EegDemandeWhereInput = {};
    const periode = this.buildPeriodeWhere(dateDebut, dateFin);
    if (periode) where.dateCreation = periode;
    if (urgence) where.urgence = urgence;
    return where;
  }

  @Get('activite')
  @ApiOperation({ summary: 'Volumes des demandes EEG' })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'urgence', required: false, enum: ['STAT', 'URGENTE', 'NORMALE'] })
  @ApiQuery({ name: 'statut', required: false, enum: ['CREEE', 'PLANIFIEE', 'EN_COURS', 'RESULTAT_DISPONIBLE', 'ANNULEE'] })
  async getActivite(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('urgence') urgence?: UrgenceFilter,
    @Query('statut') statut?: StatutFilter,
  ) {
    const base = this.buildBaseWhere(dateDebut, dateFin, urgence);
    // Le filtre `statut` restreint TOUS les compteurs (pas seulement
    // `recues`) : chaque catégorie est comptée parmi les demandes
    // correspondant au statut filtré.
    const scope: Prisma.EegDemandeWhereInput = {
      ...base,
      ...(statut ? { statut } : {}),
    };

    const [recues, traitees, acceptees, annulees, enAttente] =
      await Promise.all([
        this.prisma.eegDemande.count({ where: scope }),
        this.prisma.eegDemande.count({
          where: { ...scope, statut: 'RESULTAT_DISPONIBLE' },
        }),
        this.prisma.eegDemande.count({
          where: {
            ...scope,
            statut: { in: ['PLANIFIEE', 'EN_COURS', 'RESULTAT_DISPONIBLE'] },
          },
        }),
        this.prisma.eegDemande.count({
          where: { ...scope, statut: 'ANNULEE' },
        }),
        this.prisma.eegDemande.count({
          where: {
            ...scope,
            statut: { in: ['CREEE', 'PLANIFIEE', 'EN_COURS'] },
          },
        }),
      ]);
    return { recues, traitees, acceptees, annulees, enAttente };
  }

  @Get('delais')
  @ApiOperation({ summary: 'Délais moyens de traitement' })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'urgence', required: false, enum: ['STAT', 'URGENTE', 'NORMALE'] })
  async getDelais(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('urgence') urgence?: UrgenceFilter,
  ) {
    const base = this.buildBaseWhere(dateDebut, dateFin, urgence);
    const demandes = await this.prisma.eegDemande.findMany({
      where: {
        ...base,
        dateValidation: { not: null },
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
    summary: 'Répartition démographique — sexe, âge',
    description:
      "Chiffres calculés uniquement sur les patients ayant réellement passé un examen EEG. Filtrable par période et sexe.",
  })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'sexe', required: false, enum: ['M', 'F'] })
  async getDemographie(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('sexe') sexe?: SexeFilter,
  ) {
    const periode = this.buildPeriodeWhere(dateDebut, dateFin);
    const where: Prisma.EegDemandeWhereInput = {
      statut: { in: ['EN_COURS', 'RESULTAT_DISPONIBLE'] },
      ...(periode ? { dateCreation: periode } : {}),
    };

    const [demandes, patients] = await Promise.all([
      this.prisma.eegDemande.findMany({
        where,
        select: { patientId: true, statut: true },
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

      if (sexe && patient?.sexe !== sexe) continue;

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
    };
  }

  @Get('evolution')
  @ApiOperation({ summary: 'Évolution temporelle des demandes EEG' })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'urgence', required: false, enum: ['STAT', 'URGENTE', 'NORMALE'] })
  async getEvolution(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('urgence') urgence?: UrgenceFilter,
  ) {
    const base = this.buildBaseWhere(dateDebut, dateFin, urgence);

    const demandes = await this.prisma.eegDemande.findMany({
      where: base,
      select: { dateCreation: true, statut: true },
      orderBy: { dateCreation: 'asc' },
    });

    const parJour: Record<string, { total: number; traitees: number; annulees: number }> = {};
    for (const d of demandes) {
      const jour = d.dateCreation.toISOString().slice(0, 10);
      if (!parJour[jour]) parJour[jour] = { total: 0, traitees: 0, annulees: 0 };
      parJour[jour].total++;
      if (d.statut === 'RESULTAT_DISPONIBLE') parJour[jour].traitees++;
      if (d.statut === 'ANNULEE') parJour[jour].annulees++;
    }

    return { parJour };
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'Résultats critiques' })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'statut', required: false, enum: ['CREEE', 'PLANIFIEE', 'EN_COURS', 'RESULTAT_DISPONIBLE', 'ANNULEE'] })
  async getAnomalies(
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('statut') statut?: StatutFilter,
  ) {
    const demandeWhere: Prisma.EegDemandeWhereInput = {};
    if (statut) demandeWhere.statut = statut;
    const periode = this.buildPeriodeWhere(dateDebut, dateFin);
    if (periode) demandeWhere.dateCreation = periode;

    const resultats = await this.prisma.eegResultat.findMany({
      where: {
        estCritique: true,
        ...(Object.keys(demandeWhere).length > 0 ? { demande: demandeWhere } : {}),
      },
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
