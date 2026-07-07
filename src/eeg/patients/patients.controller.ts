import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from './patient-lookup.service';
import { AccueilClientService } from './accueil-client.service';
import { PrescriptionClientService } from '../external/prescription-client.service';

@Controller('eeg/patients')
export class PatientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly accueilClient: AccueilClientService,
    private readonly prescriptionClient: PrescriptionClientService,
  ) {}

  private async toResponse(patient: {
    id: string;
    nom: string;
    prenom: string;
    age: number | null;
    sexe: string | null;
  }) {
    const [idDossier, counts] = await Promise.all([
      this.patientLookup.getIdDossier(patient.id),
      this.patientLookup.getPatientCounts(patient.id),
    ]);
    return { ...patient, idDossier, _count: counts };
  }

  @Get()
  async getPatients(@Query('search') search?: string) {
    // Ne montrer que les patients ayant une interaction quelconque avec le
    // service EEG — pas tout le fichier patients d'Accueil, dont la grande
    // majorité n'a jamais eu affaire au service. Ça inclut : les demandes
    // déjà connues localement quel que soit leur statut (en attente,
    // planifiée, réalisée, archivée, refusée/annulée), ainsi que les
    // prescriptions encore virtuelles (pas encore promues localement, tant
    // qu'aucun technicien n'a agi dessus).
    const [demandesLocales, prescriptions] = await Promise.all([
      this.prisma.eegDemande.findMany({
        distinct: ['patientId'],
        select: { patientId: true },
      }),
      this.prescriptionClient.listEegPrescriptions(),
    ]);
    const idsAutorises = new Set([
      ...demandesLocales.map((d) => d.patientId),
      ...prescriptions.map((p) => p.patientId),
    ]);

    const patients = await this.accueilClient.listPatients(undefined, search);
    const patientsEeg = patients.filter((p) => idsAutorises.has(p.id));
    return Promise.all(patientsEeg.map((p) => this.toResponse(p)));
  }

  @Get('dossier/:idDossier')
  async getPatientByDossier(@Param('idDossier') idDossier: string) {
    const dossier = await this.prisma.eegDossier.findUnique({
      where: { idDossier },
    });
    if (!dossier) return null;
    return this.getPatientById(dossier.patientId);
  }

  @Get('external/:externalPatientId')
  async getPatientByExternalId(
    @Param('externalPatientId') externalPatientId: string,
  ) {
    return this.getPatientById(externalPatientId);
  }

  @Get(':id')
  async getPatientById(@Param('id') id: string) {
    const patient = await this.accueilClient.getPatientByExternalId(id);
    if (!patient) return null;

    const [demandes, rdvs, base] = await Promise.all([
      this.prisma.eegDemande.findMany({
        where: { patientId: id },
        orderBy: { dateCreation: 'desc' },
        take: 10,
        include: {
          resultat: {
            select: {
              estImmutable: true,
              estCritique: true,
              dateValidation: true,
            },
          },
        },
      }),
      this.prisma.eegRdv.findMany({
        where: { patientId: id },
        orderBy: { dateRdv: 'desc' },
        take: 5,
      }),
      this.toResponse(patient),
    ]);

    return { ...base, demandes, rdvs };
  }

  @Patch(':id')
  async modifierPatient(@Param('id') id: string, @Body() body: any) {
    if (body.idDossier) {
      await this.patientLookup.assignIdDossier(id, body.idDossier);
    }

    const demographicUpdate: {
      nom?: string;
      prenom?: string;
      sexe?: 'M' | 'F';
    } = {};
    if (body.nom) demographicUpdate.nom = body.nom;
    if (body.prenom) demographicUpdate.prenom = body.prenom;
    if (body.sexe) demographicUpdate.sexe = body.sexe;

    if (Object.keys(demographicUpdate).length > 0) {
      const updated = await this.accueilClient.updatePatient(
        id,
        demographicUpdate,
      );
      if (!updated)
        throw new NotFoundException(`Patient ${id} introuvable dans Accueil`);
    }

    return this.getPatientById(id);
  }
}
