import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { UserLookupService } from '../../common/clients/user-lookup.service';
import { Roles } from '../../common/decorators/roles.decorator';

// Contient des données cliniques (conclusions, interprétations) : réservé
// aux 3 rôles EEG, comme le reste du module — sans ce garde, n'importe quel
// rôle authentifié (même hors service EEG) pouvait parcourir tous les
// résultats archivés par simple appel API direct.
@Roles('TECHNICIEN', 'CHEF_SERVICE', 'MAJOR_SERVICE')
@ApiTags('Archives')
@Controller('eeg/archives')
export class ArchivesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly userLookup: UserLookupService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Archives EEG — résultats validés',
    description:
      'Retourne uniquement les résultats validés (estImmutable=true). Filtrable par patient, date, conclusion, numéro EEG.',
  })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'numeroEEG', required: false })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({
    name: 'conclusion',
    required: false,
    description: 'Recherche texte libre dans conclusion',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page (défaut 1)' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Résultats par page (défaut 20, max 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des résultats archivés',
  })
  async getArchives(
    @Query('patientId') patientId?: string,
    @Query('numeroEEG') numeroEEG?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('conclusion') conclusion?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const skip = (pageNum - 1) * limitNum;

    const filtreDemande: Prisma.EegDemandeWhereInput = {};
    if (patientId) filtreDemande.patientId = patientId;
    if (numeroEEG) filtreDemande.numeroEEG = { contains: numeroEEG };

    const where: Prisma.EegResultatWhereInput = {
      estImmutable: true,
      demande: filtreDemande,
    };

    if (dateDebut || dateFin) {
      const filtreDate: Prisma.DateTimeNullableFilter = {};
      if (dateDebut) filtreDate.gte = new Date(dateDebut);
      if (dateFin) {
        const fin = new Date(dateFin);
        fin.setHours(23, 59, 59, 999);
        filtreDate.lte = fin;
      }
      where.dateValidation = filtreDate;
    }
    if (conclusion) {
      where.conclusion = { contains: conclusion };
    }

    const [total, resultats] = await Promise.all([
      this.prisma.eegResultat.count({ where }),
      this.prisma.eegResultat.findMany({
        where,
        include: {
          demande: {
            select: {
              numeroEEG: true,
              typeEEG: true,
              urgence: true,
              statut: true,
              dateCreation: true,
              patientId: true,
              prescripteurId: true,
              // Champs nécessaires au compte rendu officiel CHUA généré
              // côté front : date/heure de réalisation, motif, snapshot
              // clinique de la prescription et prescripteur externe.
              dateRealisation: true,
              dateRDV: true,
              dateValidation: true,
              motifPrescription: true,
              aeActuel: true,
              agePremiereCrise: true,
              dpm: true,
              typeCrise: true,
              dateDerniereCrise: true,
              prescripteurExterneNom: true,
              prescripteurExternePrenom: true,
              prescripteurExterne: true,
              rdv: {
                select: {
                  heureDebut: true,
                  heureFin: true,
                  renseignementClinique: true,
                  dateRdv: true,
                },
              },
            },
          },
          rectifications: {
            orderBy: { dateRectification: 'desc' },
            take: 1,
            select: { dateRectification: true, motif: true },
          },
        },
        orderBy: { dateValidation: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const data = await Promise.all(
      resultats.map(async (r) => {
        const [patient, prescripteur, medecinValidateur] = await Promise.all([
          this.patientLookup.getPatientInfo(r.demande.patientId),
          this.userLookup.getUserInfo(r.demande.prescripteurId),
          this.userLookup.getUserInfo(r.medecinValidateurId),
        ]);
        // Le générateur de compte rendu (eeg_front) lit ces clés à la RACINE
        // du résultat, en plus de `demande.patient.*` : on les y expose donc
        // aussi. Aucun champ existant n'est renommé — uniquement des ajouts.
        const renseignementClinique =
          r.demande.rdv?.renseignementClinique ??
          r.demande.motifPrescription ??
          null;
        return {
          ...r,
          adresse: patient.adresse,
          contact: patient.contact,
          renseignementClinique,
          dateRealisation: r.demande.dateRealisation,
          dateExamen: r.demande.dateRealisation ?? r.demande.dateRDV,
          heuresExamen: r.demande.rdv?.heureDebut ?? null,
          medecinValidateur,
          demande: {
            ...r.demande,
            patient,
            prescripteur,
            adresse: patient.adresse,
            contact: patient.contact,
          },
        };
      }),
    );

    return {
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Get('annulees')
  @ApiOperation({
    summary: 'Archives EEG — demandes refusées ou annulées',
    description:
      "Retourne les demandes au statut ANNULEE (refus technicien ou annulation), pour qu'elles n'encombrent plus le fil de travail tout en restant consultables.",
  })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'numeroEEG', required: false })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, description: 'Page (défaut 1)' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Résultats par page (défaut 20, max 100)',
  })
  async getArchivesAnnulees(
    @Query('patientId') patientId?: string,
    @Query('numeroEEG') numeroEEG?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.EegDemandeWhereInput = { statut: 'ANNULEE' };
    if (patientId) where.patientId = patientId;
    if (numeroEEG) where.numeroEEG = { contains: numeroEEG };
    if (dateDebut || dateFin) {
      where.dateCreation = {};
      if (dateDebut) where.dateCreation.gte = new Date(dateDebut);
      if (dateFin) {
        const fin = new Date(dateFin);
        fin.setHours(23, 59, 59, 999);
        where.dateCreation.lte = fin;
      }
    }

    const [total, demandes] = await Promise.all([
      this.prisma.eegDemande.count({ where }),
      this.prisma.eegDemande.findMany({
        where,
        orderBy: { dateCreation: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const avecPatient =
      await this.patientLookup.attachPatientInfoToMany(demandes);
    const data =
      await this.userLookup.attachPrescripteurInfoToMany(avecPatient);

    return {
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }
}
