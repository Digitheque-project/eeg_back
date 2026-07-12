import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutRdv } from '@prisma/client';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { estWeekend, ajouterMinutes } from '../../common/utils/date.util';
import { CreateRdvDto } from './dto/create-rdv.dto';
import { ModifierRdvDto } from './dto/modifier-rdv.dto';
import { RealiserRdvDto } from './dto/realiser-rdv.dto';

@Controller('eeg/rdvs')
export class RdvsController {
  private readonly logger = new Logger(RdvsController.name);

  // Ordre de progression des statuts EegDemande (Phase 4).
  // Aucune constante centralisée n'existe dans le projet — cette définition
  // doit être déplacée dans un fichier partagé lors du nettoyage Phase 5.
  private static readonly STATUTS_ORDONNES: string[] = [
    'CREEE', // 1
    'PLANIFIEE', // 2
    'EN_COURS', // 3
    'RESULTAT_DISPONIBLE', // 4
    // ANNULEE est un état terminal hors chaîne principale
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
  ) {}

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
        prescripteur: { select: { nom: true, role: true } },
        demande: {
          select: {
            numeroEEG: true,
            statut: true,
            urgence: true,
            typeEEG: true,
            motifPrescription: true,
          },
        },
      },
      orderBy: { dateRdv: 'asc' },
    });
    return this.patientLookup.attachPatientInfoToMany(rdvs);
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
        prescripteur: { select: { nom: true, role: true } },
        demande: {
          select: {
            numeroEEG: true,
            statut: true,
            urgence: true,
            typeEEG: true,
            motifPrescription: true,
          },
        },
      },
      orderBy: { dateRdv: 'asc' },
    });
    return this.patientLookup.attachPatientInfoToMany(rdvs);
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
        prescripteur: { select: { nom: true, role: true } },
        demande: {
          select: {
            numeroEEG: true,
            statut: true,
            urgence: true,
            typeEEG: true,
          },
        },
      },
      orderBy: { heureDebut: 'asc' },
    });
    return this.patientLookup.attachPatientInfoToMany(rdvs);
  }

  @Get(':id')
  async getRdvById(@Param('id') id: string) {
    const rdv = await this.prisma.eegRdv.findUnique({
      where: { id },
      include: {
        prescripteur: true,
        demande: true,
        notifications: true,
      },
    });
    if (!rdv) return null;
    return this.patientLookup.attachPatientInfo(rdv);
  }

  @Post()
  async creerRdv(@Body() body: CreateRdvDto) {
    const dateRdv = new Date(body.dateRdv);
    if (estWeekend(dateRdv)) {
      throw new BadRequestException(
        'Impossible de planifier un RDV le week-end',
      );
    }
    const rdv = await this.prisma.eegRdv.create({
      data: {
        patientId: body.patientId,
        prescripteurId: body.prescripteurId,
        demandeId: body.demandeId ?? null,
        typeEEG: body.typeEEG,
        priorite: body.priorite,
        dateRdv,
        heureDebut: body.heureDebut,
        heureFin: body.heureFin,
        dureeMinutes: body.dureeMinutes,
        renseignementClinique: body.renseignementClinique ?? null,
      },
      include: {
        prescripteur: true,
      },
    });
    return this.patientLookup.attachPatientInfo(rdv);
  }

  @Patch(':id')
  async modifierRdv(@Param('id') id: string, @Body() body: ModifierRdvDto) {
    const data: Partial<ModifierRdvDto & { dateRdv: Date }> = {};
    if (body.dateRdv) {
      const dateRdv = new Date(body.dateRdv);
      if (estWeekend(dateRdv)) {
        throw new BadRequestException(
          'Impossible de planifier un RDV le week-end',
        );
      }
      data.dateRdv = dateRdv as any;
    }
    if (body.heureDebut) data.heureDebut = body.heureDebut;
    if (body.dureeMinutes) data.dureeMinutes = body.dureeMinutes;
    // heureFin est recalculée dès que heureDebut et/ou dureeMinutes changent
    // (le formulaire simplifié n'envoie plus heureFin directement) — sauf
    // si elle est explicitement fournie, pour les autres appelants API.
    if (body.heureFin) {
      data.heureFin = body.heureFin;
    } else if (body.heureDebut && body.dureeMinutes) {
      data.heureFin = ajouterMinutes(body.heureDebut, body.dureeMinutes);
    }
    if (body.statut) data.statut = body.statut;
    if (body.renseignementClinique !== undefined)
      data.renseignementClinique = body.renseignementClinique;
    const rdv = await this.prisma.eegRdv.update({
      where: { id },
      data,
      include: { prescripteur: true, demande: true },
    });
    return this.patientLookup.attachPatientInfo(rdv);
  }

  @Patch(':id/realiser')
  async realiserRdv(@Param('id') id: string, @Body() body: RealiserRdvDto) {
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
    // Charger le RDV avec sa demande liée pour déterminer si une répercussion est nécessaire
    const rdv = await this.prisma.eegRdv.findUnique({
      where: { id },
      include: { demande: true },
    });
    if (!rdv) throw new NotFoundException(`RDV ${id} introuvable`);

    return this.prisma.$transaction(async (tx) => {
      // 1. Répercuter sur la demande liée (garde de non-régression) et
      // déterminer si ce RDV doit être délié de sa demande — sinon, la
      // contrainte unique sur demandeId empêche toute replanification
      // future (la demande redevient CREEE mais le RDV EN_ATTENTE reste
      // accroché dessus).
      let delierDemande = false;
      if (rdv.demandeId && rdv.demande) {
        const statutActuel = rdv.demande.statut as string;
        const rangActuel =
          RdvsController.STATUTS_ORDONNES.indexOf(statutActuel);
        const rangPlanifiee =
          RdvsController.STATUTS_ORDONNES.indexOf('PLANIFIEE');

        if (rangActuel === rangPlanifiee) {
          // La demande est encore à PLANIFIEE — on la repasse à CREEE pour que le technicien replanifie
          await tx.eegDemande.update({
            where: { id: rdv.demandeId },
            data: { statut: 'CREEE', dateRDV: null },
          });
          delierDemande = true;
          this.logger.log(
            `RDV ${id} marqué NON_REALISE — demande ${rdv.demandeId} repassée à CREEE`,
          );
        } else if (rangActuel > rangPlanifiee) {
          // La demande est déjà plus avancée (EN_COURS+) — ne pas régresser, juste avertir
          this.logger.warn(
            `RDV ${id} marqué NON_REALISE mais demande ${rdv.demandeId} est à ${statutActuel} ` +
              `(plus avancé que PLANIFIEE) — statut demande inchangé`,
          );
        }
      }

      // 2. Mettre à jour le statut du RDV (et le délier si nécessaire)
      return tx.eegRdv.update({
        where: { id },
        data: {
          statut: StatutRdv.NON_REALISE,
          ...(delierDemande ? { demandeId: null } : {}),
        },
      });
    });
  }

  @Patch(':id/annuler')
  async annulerRdv(@Param('id') id: string) {
    // Charger le RDV avec sa demande liée pour déterminer si une répercussion est nécessaire
    const rdv = await this.prisma.eegRdv.findUnique({
      where: { id },
      include: { demande: true },
    });
    if (!rdv) throw new NotFoundException(`RDV ${id} introuvable`);

    return this.prisma.$transaction(async (tx) => {
      // 1. Répercuter sur la demande liée (garde de non-régression) et
      // déterminer si ce RDV doit être délié de sa demande — sinon, la
      // contrainte unique sur demandeId empêche toute replanification
      // future (la demande redevient CREEE mais le RDV ANNULE reste
      // accroché dessus).
      let delierDemande = false;
      if (rdv.demandeId && rdv.demande) {
        const statutActuel = rdv.demande.statut as string;
        const rangActuel =
          RdvsController.STATUTS_ORDONNES.indexOf(statutActuel);
        const rangPlanifiee =
          RdvsController.STATUTS_ORDONNES.indexOf('PLANIFIEE');

        if (rangActuel === rangPlanifiee) {
          // La demande est encore à PLANIFIEE — on la repasse à CREEE pour que le technicien replanifie
          await tx.eegDemande.update({
            where: { id: rdv.demandeId },
            data: { statut: 'CREEE', dateRDV: null },
          });
          delierDemande = true;
          this.logger.log(
            `RDV ${id} annulé — demande ${rdv.demandeId} repassée à CREEE`,
          );
        } else if (rangActuel > rangPlanifiee) {
          // La demande est déjà plus avancée (EN_COURS+) — ne pas régresser, juste avertir
          this.logger.warn(
            `RDV ${id} annulé mais demande ${rdv.demandeId} est à ${statutActuel} ` +
              `(plus avancé que PLANIFIEE) — statut demande inchangé`,
          );
        }
      }

      // 2. Mettre à jour le statut du RDV (et le délier si nécessaire)
      return tx.eegRdv.update({
        where: { id },
        data: {
          statut: StatutRdv.ANNULE,
          ...(delierDemande ? { demandeId: null } : {}),
        },
      });
    });
  }

  @Delete(':id')
  async supprimerRdv(@Param('id') id: string) {
    await this.prisma.eegRdv.delete({ where: { id } });
    return { message: `RDV ${id} supprimé` };
  }
}
