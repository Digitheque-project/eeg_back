import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutRdv } from '@prisma/client';

import { PatientLookupService } from '../patients/patient-lookup.service';

@Controller('eeg/rdvs')
export class RdvsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
  ) {}

  private async enrichRdvs(rdvs: any[]) {
    return Promise.all(
      rdvs.map(async (r) => {
        if (!r.patient) return r;
        if (!r.patient.isExternal) return r;
        const info = await this.patientLookup.getPatientInfoWithExternalLookup(r.patient);
        return {
          ...r,
          patient: {
            ...r.patient,
            nom: info.nom,
            prenom: info.prenom,
            age: info.age,
            sexe: info.sexe
          }
        };
      })
    );
  }

  @Get()
  async getRdvs(
    @Query('statut') statut?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('patientId') patientId?: string,
  ) {
    const where: any = {};
    if (statut) where.statut = statut as StatutRdv;
    if (dateDebut || dateFin) {
      where.dateRdv = {};
      if (dateDebut) where.dateRdv.gte = new Date(dateDebut);
      if (dateFin) where.dateRdv.lte = new Date(dateFin);
    }
    if (patientId) where.patientId = patientId;
    const rdvs = await this.prisma.eegRdv.findMany({
      where,
      include: {
        patient: true,
        prescripteur: { select: { nom: true, role: true } },
        demande: { select: { numeroEEG: true, statut: true, urgence: true, typeEEG: true, motifPrescription: true } },
      },
      orderBy: { dateRdv: 'asc' },
    });
    return this.enrichRdvs(rdvs);
  }

  @Get('semaine')
  async getRdvsSemaine() {
    const maintenant = new Date();
    const debutSemaine = new Date(maintenant);
    debutSemaine.setDate(maintenant.getDate() - maintenant.getDay() + 1);
    debutSemaine.setHours(0, 0, 0, 0);
    const finSemaine = new Date(debutSemaine);
    finSemaine.setDate(debutSemaine.getDate() + 6);
    finSemaine.setHours(23, 59, 59, 999);
    const rdvs = await this.prisma.eegRdv.findMany({
      where: { dateRdv: { gte: debutSemaine, lte: finSemaine } },
      include: {
        patient: true,
        prescripteur: { select: { nom: true, role: true } },
        demande: { select: { numeroEEG: true, statut: true, urgence: true, typeEEG: true, motifPrescription: true } },
      },
      orderBy: { dateRdv: 'asc' },
    });
    return this.enrichRdvs(rdvs);
  }

  @Get('today')
  async getRdvsAujourdhui() {
    const debut = new Date();
    debut.setHours(0, 0, 0, 0);
    const fin = new Date();
    fin.setHours(23, 59, 59, 999);
    const rdvs = await this.prisma.eegRdv.findMany({
      where: { dateRdv: { gte: debut, lte: fin } },
      include: {
        patient: true,
        prescripteur: { select: { nom: true, role: true } },
        demande: { select: { numeroEEG: true, statut: true, urgence: true, typeEEG: true } },
      },
      orderBy: { heureDebut: 'asc' },
    });
    return this.enrichRdvs(rdvs);
  }

  @Get(':id')
  async getRdvById(@Param('id') id: string) {
    const rdv = await this.prisma.eegRdv.findUnique({
      where: { id },
      include: {
        patient: true,
        prescripteur: true,
        demande: true,
        notifications: true,
      },
    });
    if (!rdv) return null;
    const [enriched] = await this.enrichRdvs([rdv]);
    return enriched;
  }

  @Post()
  async creerRdv(@Body() body: any) {
    return this.prisma.eegRdv.create({
      data: {
        patientId: body.patientId,
        prescripteurId: body.prescripteurId,
        demandeId: body.demandeId ?? null,
        typeEEG: body.typeEEG,
        salle: body.salle,
        priorite: body.priorite,
        dateRdv: new Date(body.dateRdv),
        heureDebut: body.heureDebut,
        heureFin: body.heureFin,
        dureeMinutes: body.dureeMinutes,
        renseignementClinique: body.renseignementClinique ?? null,
      },
      include: {
        patient: true,
        prescripteur: true,
      },
    });
  }

  @Patch(':id')
  async modifierRdv(@Param('id') id: string, @Body() body: any) {
    const data: any = {};
    if (body.dateRdv) data.dateRdv = new Date(body.dateRdv);
    if (body.heureDebut) data.heureDebut = body.heureDebut;
    if (body.heureFin) data.heureFin = body.heureFin;
    if (body.dureeMinutes) data.dureeMinutes = body.dureeMinutes;
    if (body.salle) data.salle = body.salle;
    if (body.statut) data.statut = body.statut as StatutRdv;
    if (body.renseignementClinique !== undefined) data.renseignementClinique = body.renseignementClinique;
    return this.prisma.eegRdv.update({
      where: { id },
      data,
      include: { patient: true, prescripteur: true, demande: true },
    });
  }

  @Patch(':id/realiser')
  async realiserRdv(@Param('id') id: string, @Body() body: any) {
    return this.prisma.eegRdv.update({
      where: { id },
      data: {
        statut: StatutRdv.REALISE,
        dateRealisation: new Date(),
        technicienRealisateurId: body.technicienId ?? null,
      },
    });
  }

  @Patch(':id/non-realise')
  async marquerNonRealise(@Param('id') id: string) {
    return this.prisma.eegRdv.update({
      where: { id },
      data: { statut: StatutRdv.NON_REALISE },
    });
  }

  @Patch(':id/annuler')
  async annulerRdv(@Param('id') id: string) {
    return this.prisma.eegRdv.update({
      where: { id },
      data: { statut: StatutRdv.ANNULE },
    });
  }

  @Delete(':id')
  async supprimerRdv(@Param('id') id: string) {
    await this.prisma.eegRdv.delete({ where: { id } });
    return { message: `RDV ${id} supprimé` };
  }
}
