import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from './patient-lookup.service';

@Controller('eeg/patients')
export class PatientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
  ) {}

  @Get()
  async getPatients(@Query('search') search?: string) {
    const patients = await this.prisma.patient.findMany({
      where: search
        ? {
            OR: [
              { nom: { contains: search } },
              { prenom: { contains: search } },
              { idDossier: { contains: search } },
              { externalPatientId: { contains: search } },
            ],
          }
        : undefined,
      include: {
        _count: { select: { demandes: true, rdvs: true } },
      },
      orderBy: { nom: 'asc' },
    });

    return Promise.all(
      patients.map(async (p) => {
        if (!p.isExternal) return p;
        const info = await this.patientLookup.getPatientInfoWithExternalLookup(p);
        return { ...p, nom: info.nom, prenom: info.prenom, age: info.age, sexe: info.sexe };
      })
    );
  }

  @Get('dossier/:idDossier')
  async getPatientByDossier(@Param('idDossier') idDossier: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { idDossier },
      include: {
        demandes: {
          orderBy: { dateCreation: 'desc' },
          take: 5,
        },
        _count: { select: { demandes: true, rdvs: true } },
      },
    });

    if (!patient) return null;
    if (!patient.isExternal) return patient;
    const info = await this.patientLookup.getPatientInfoWithExternalLookup(patient);
    return { ...patient, nom: info.nom, prenom: info.prenom, age: info.age, sexe: info.sexe };
  }

  @Get('external/:externalPatientId')
  async getPatientByExternalId(
    @Param('externalPatientId') externalPatientId: string,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { externalPatientId },
      include: {
        demandes: {
          orderBy: { dateCreation: 'desc' },
          take: 10,
          include: {
            resultat: {
              select: { estImmutable: true, estCritique: true, dateValidation: true },
            },
          },
        },
        rdvs: {
          orderBy: { dateRdv: 'desc' },
          take: 5,
        },
        _count: { select: { demandes: true, rdvs: true } },
      },
    });

    if (!patient) return null;
    const info = await this.patientLookup.getPatientInfoWithExternalLookup(patient);
    return { ...patient, nom: info.nom, prenom: info.prenom, age: info.age, sexe: info.sexe };
  }

  @Get(':id')
  async getPatientById(@Param('id') id: string) {
    // Support both local UUID and external patient ID
    const foundPatient = await this.patientLookup.findPatientByIdOrExternal(id);

    if (!foundPatient) {
      return null;
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: foundPatient.id },
      include: {
        demandes: {
          orderBy: { dateCreation: 'desc' },
          take: 10,
          include: {
            resultat: {
              select: { estImmutable: true, estCritique: true, dateValidation: true },
            },
          },
        },
        rdvs: {
          orderBy: { dateRdv: 'desc' },
          take: 5,
        },
        _count: { select: { demandes: true, rdvs: true } },
      },
    });

    if (!patient) return null;
    if (!patient.isExternal) return patient;
    const info = await this.patientLookup.getPatientInfoWithExternalLookup(patient);
    return { ...patient, nom: info.nom, prenom: info.prenom, age: info.age, sexe: info.sexe };
  }

  @Post()
  async creerPatient(@Body() body: any) {
    return this.prisma.patient.create({
      data: {
        nom: body.nom,
        prenom: body.prenom,
        age: body.age,
        sexe: body.sexe,
        idDossier: body.idDossier,
        sourceSystem: 'LOCAL',
        isExternal: false,
      },
    });
  }

  @Patch(':id')
  async modifierPatient(@Param('id') id: string, @Body() body: any) {
    // Support both local UUID and external patient ID
    const patient = await this.patientLookup.findPatientByIdOrExternal(id);

    if (!patient) {
      throw new Error('Patient not found');
    }

    const data: any = {};
    if (body.nom) data.nom = body.nom;
    if (body.prenom) data.prenom = body.prenom;
    if (body.age) data.age = body.age;
    if (body.sexe) data.sexe = body.sexe;
    if (body.idDossier) data.idDossier = body.idDossier;

    return this.prisma.patient.update({ where: { id: patient.id }, data });
  }
}
