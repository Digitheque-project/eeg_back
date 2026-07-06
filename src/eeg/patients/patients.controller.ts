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

@Controller('eeg/patients')
export class PatientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly accueilClient: AccueilClientService,
  ) {}

  private async toResponse(patient: { id: string; nom: string; prenom: string; age: number | null; sexe: string | null }) {
    const [idDossier, counts] = await Promise.all([
      this.patientLookup.getIdDossier(patient.id),
      this.patientLookup.getPatientCounts(patient.id),
    ]);
    return { ...patient, idDossier, _count: counts };
  }

  @Get()
  async getPatients(@Query('search') search?: string) {
    const patients = await this.accueilClient.listPatients(undefined, search);
    return Promise.all(patients.map((p) => this.toResponse(p)));
  }

  @Get('dossier/:idDossier')
  async getPatientByDossier(@Param('idDossier') idDossier: string) {
    const dossier = await this.prisma.eegDossier.findUnique({ where: { idDossier } });
    if (!dossier) return null;
    return this.getPatientById(dossier.patientId);
  }

  @Get('external/:externalPatientId')
  async getPatientByExternalId(@Param('externalPatientId') externalPatientId: string) {
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
          resultat: { select: { estImmutable: true, estCritique: true, dateValidation: true } },
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

    const demographicUpdate: { nom?: string; prenom?: string; sexe?: 'M' | 'F' } = {};
    if (body.nom) demographicUpdate.nom = body.nom;
    if (body.prenom) demographicUpdate.prenom = body.prenom;
    if (body.sexe) demographicUpdate.sexe = body.sexe;

    if (Object.keys(demographicUpdate).length > 0) {
      const updated = await this.accueilClient.updatePatient(id, demographicUpdate);
      if (!updated) throw new NotFoundException(`Patient ${id} introuvable dans Accueil`);
    }

    return this.getPatientById(id);
  }
}
