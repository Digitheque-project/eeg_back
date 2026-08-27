import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutRdv } from '@prisma/client';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { UserLookupService } from '../../common/clients/user-lookup.service';
import { ajouterMinutes } from '../../common/utils/date.util';
import { CreateRdvDto } from './dto/create-rdv.dto';
import { ModifierRdvDto } from './dto/modifier-rdv.dto';
import { RealiserRdvDto } from './dto/realiser-rdv.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { DemandesService } from '../demandes/demandes.service';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { BearerToken } from '../../common/decorators/bearer-token.decorator';

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
    private readonly userLookup: UserLookupService,
    private readonly demandesService: DemandesService,
  ) {}

  // Contrôle de chevauchement de créneau (pas simple égalité de l'heure de
  // début) : deux RDV qui se chevauchent ne doivent pas coexister.
  private async trouverConflitRdv(
    dateRdv: Date,
    heureDebut: string,
    dureeMinutes: number,
    exclureRdvId?: string,
    heureFinExplicite?: string,
  ) {
    const rdvs = await this.prisma.eegRdv.findMany({
      where: {
        dateRdv,
        statut: { notIn: ['ANNULE', 'NON_REALISE'] },
        ...(exclureRdvId ? { id: { not: exclureRdvId } } : {}),
      },
      select: { heureDebut: true, heureFin: true, dureeMinutes: true },
    });
    // Une heureFin explicitement fournie (appelants API hors formulaire
    // simplifié) prime sur celle dérivée de dureeMinutes — sinon un
    // chevauchement portant uniquement sur une heureFin modifiée passait
    // inaperçu.
    const heureFin = heureFinExplicite ?? ajouterMinutes(heureDebut, dureeMinutes);
    return rdvs.find(
      (r) =>
        heureDebut <
          (r.heureFin ?? ajouterMinutes(r.heureDebut, r.dureeMinutes ?? 60)) &&
        heureFin > r.heureDebut,
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
    const avecPatient = await this.patientLookup.attachPatientInfoToMany(rdvs);
    return this.userLookup.attachPrescripteurInfoToMany(avecPatient);
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
    const avecPatient = await this.patientLookup.attachPatientInfoToMany(rdvs);
    return this.userLookup.attachPrescripteurInfoToMany(avecPatient);
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
    const avecPatient = await this.patientLookup.attachPatientInfoToMany(rdvs);
    return this.userLookup.attachPrescripteurInfoToMany(avecPatient);
  }

  @Get(':id')
  async getRdvById(@Param('id') id: string) {
    const rdv = await this.prisma.eegRdv.findUnique({
      where: { id },
      include: {
        demande: true,
        notifications: true,
      },
    });
    if (!rdv) return null;
    const avecPatient = await this.patientLookup.attachPatientInfo(rdv);
    return this.userLookup.attachPrescripteurInfo(avecPatient);
  }

  // Fait doublon avec demandes.controller.ts:planifierRdv (le vrai flux de
  // planification côté worklist). Gardé pour compat API, sans UI dédiée.
  @Roles('TECHNICIEN', 'CHEF_SERVICE')
  @Post()
  async creerRdv(@Body() body: CreateRdvDto) {
    const dateRdv = new Date(body.dateRdv);
    const dureeMinutes = body.dureeMinutes ?? 60;
    const heureFinCalculee = body.heureFin ?? ajouterMinutes(body.heureDebut, dureeMinutes);
    if (heureFinCalculee <= body.heureDebut) {
      throw new BadRequestException(
        'Ce créneau dépasse minuit — impossible à planifier sur une seule journée',
      );
    }
    const conflit = await this.trouverConflitRdv(
      dateRdv,
      body.heureDebut,
      dureeMinutes,
      undefined,
      body.heureFin,
    );
    if (conflit) throw new BadRequestException('Créneau déjà occupé');

    // Si le RDV est lié à une demande, la faire passer à PLANIFIEE dans la
    // même transaction que la création du RDV — sinon la demande reste
    // CREEE alors qu'un RDV existe déjà pour elle : le flux normal
    // (demandes.controller.ts:planifierRdv, qui exige statut === 'CREEE')
    // tente alors de créer un second RDV et échoue sur la contrainte
    // unique EegRdv.demandeId.
    if (body.demandeId) {
      const demande = await this.prisma.eegDemande.findUnique({
        where: { id: body.demandeId },
      });
      if (!demande) {
        throw new BadRequestException(`Demande ${body.demandeId} introuvable`);
      }
      if (demande.statut !== 'CREEE') {
        throw new BadRequestException(
          `Statut invalide pour planifier cette demande: ${demande.statut}`,
        );
      }
    }

    const [rdv] = await this.prisma.$transaction([
      this.prisma.eegRdv.create({
        data: {
          patientId: body.patientId,
          prescripteurId: body.prescripteurId,
          demandeId: body.demandeId ?? null,
          typeEEG: body.typeEEG,
          priorite: body.priorite,
          dateRdv,
          heureDebut: body.heureDebut,
          heureFin: heureFinCalculee,
          dureeMinutes,
          renseignementClinique: body.renseignementClinique ?? null,
        },
      }),
      ...(body.demandeId
        ? [
            this.prisma.eegDemande.update({
              where: { id: body.demandeId },
              data: { statut: 'PLANIFIEE' as const, dateRDV: dateRdv },
            }),
          ]
        : []),
    ]);
    const avecPatient = await this.patientLookup.attachPatientInfo(rdv);
    return this.userLookup.attachPrescripteurInfo(avecPatient);
  }

  @Roles('TECHNICIEN', 'CHEF_SERVICE')
  @Patch(':id')
  async modifierRdv(@Param('id') id: string, @Body() body: ModifierRdvDto) {
    const existant = await this.prisma.eegRdv.findUnique({ where: { id } });
    if (!existant) throw new NotFoundException(`RDV ${id} introuvable`);
    if (existant.statut === StatutRdv.REALISE) {
      throw new BadRequestException(
        'Ce RDV est déjà réalisé — il ne peut plus être modifié',
      );
    }

    const data: Partial<ModifierRdvDto & { dateRdv: Date }> = {};
    if (body.dateRdv) {
      data.dateRdv = new Date(body.dateRdv) as any;
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
    if (data.heureFin) {
      const heureDebutEffective = data.heureDebut ?? existant.heureDebut;
      if (data.heureFin <= heureDebutEffective) {
        throw new BadRequestException(
          'Ce créneau dépasse minuit — impossible à planifier sur une seule journée',
        );
      }
    }
    if (body.renseignementClinique !== undefined)
      data.renseignementClinique = body.renseignementClinique;

    // Vérifier le chevauchement dès que date/heure/durée/fin changent (le
    // RDV modifié lui-même est exclu du contrôle) — heureFin seule doit
    // aussi déclencher le contrôle, sinon un chevauchement introduit en ne
    // changeant que la fin du créneau passait inaperçu.
    if (body.dateRdv || body.heureDebut || body.dureeMinutes || body.heureFin) {
      const nouvelleDate = data.dateRdv ?? existant.dateRdv;
      const nouvelleHeure = (data.heureDebut as string) ?? existant.heureDebut;
      const nouvelleDuree =
        (data.dureeMinutes as number) ?? existant.dureeMinutes;
      const nouvelleFin = (data.heureFin as string) ?? existant.heureFin;
      const conflit = await this.trouverConflitRdv(
        nouvelleDate,
        nouvelleHeure,
        nouvelleDuree,
        id,
        nouvelleFin,
      );
      if (conflit) throw new BadRequestException('Créneau déjà occupé');
    }

    const rdv = await this.prisma.eegRdv.update({
      where: { id },
      data,
      include: { demande: true },
    });
    const avecPatient = await this.patientLookup.attachPatientInfo(rdv);
    return this.userLookup.attachPrescripteurInfo(avecPatient);
  }

  // Délègue à DemandesService.realiserDemande quand le RDV est lié à une
  // demande : cette méthode met à jour RDV + demande dans une même
  // transaction et envoie la notification "à interpréter" — la dupliquer
  // ici avait justement produit le bug historique où le RDV passait à
  // REALISE sans jamais faire avancer la demande (voir le commentaire dans
  // demandes.service.ts::realiserDemande).
  @Roles('TECHNICIEN', 'CHEF_SERVICE')
  @Patch(':id/realiser')
  async realiserRdv(
    @Param('id') id: string,
    @Body() body: RealiserRdvDto,
    @Request() req: AuthenticatedRequest,
    @BearerToken() token?: string,
  ) {
    const rdv = await this.prisma.eegRdv.findUnique({ where: { id } });
    if (!rdv) throw new NotFoundException(`RDV ${id} introuvable`);

    const technicienId = body.technicienId ?? req.user!.id;

    if (rdv.demandeId) {
      await this.demandesService.realiserDemande(
        rdv.demandeId,
        technicienId,
        req.user!.role!,
        token,
      );
      return this.prisma.eegRdv.findUnique({ where: { id } });
    }

    return this.prisma.eegRdv.update({
      where: { id },
      data: {
        statut: StatutRdv.REALISE,
        dateRealisation: new Date(),
        technicienRealisateurId: technicienId,
      },
    });
  }

  @Roles('TECHNICIEN', 'CHEF_SERVICE')
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

  @Roles('TECHNICIEN', 'CHEF_SERVICE')
  @Patch(':id/annuler')
  async annulerRdv(@Param('id') id: string) {
    // Charger le RDV avec sa demande liée pour déterminer si une répercussion est nécessaire
    const rdv = await this.prisma.eegRdv.findUnique({
      where: { id },
      include: { demande: true },
    });
    if (!rdv) throw new NotFoundException(`RDV ${id} introuvable`);
    if (rdv.statut === StatutRdv.REALISE) {
      throw new BadRequestException(
        'Ce RDV est déjà réalisé — il ne peut plus être annulé',
      );
    }

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

  // Suppression définitive (pas de soft-delete, pas d'audit trail) — le
  // rôle le plus restreint volontairement, cette opération est rarement
  // celle qu'on veut (préférer "annuler").
  @Roles('CHEF_SERVICE')
  @Delete(':id')
  async supprimerRdv(@Param('id') id: string) {
    await this.prisma.eegRdv.delete({ where: { id } });
    return { message: `RDV ${id} supprimé` };
  }
}
