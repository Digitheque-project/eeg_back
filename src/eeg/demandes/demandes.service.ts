import { NotificationExternalService } from '../external/notification-external.service';
import {
  PrescriptionClientService,
  PrescriptionEegDemandeFlat,
} from '../external/prescription-client.service';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { UserLookupService } from '../../common/clients/user-lookup.service';
import { getErrorMessage } from '../../common/utils/error.util';
import { estWeekend, ajouterMinutes } from '../../common/utils/date.util';
import { PlanifierRdvDto } from './dto/planifier-rdv.dto';
import { ArchiverResultatDto } from './dto/archiver-resultat.dto';
import { externalServicesConfig } from '../../common/config/external-services.config';

@Injectable()
export class DemandesService {
  private readonly logger = new Logger(DemandesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationExternalService,
    private readonly patientLookup: PatientLookupService,
    private readonly prescriptionClient: PrescriptionClientService,
    private readonly userLookup: UserLookupService,
  ) {}

  // ─── Résolution prescripteur externe ──────────────────────────────
  // Plus de table Utilisateur locale : un prescripteurId est un id externe
  // (service User) auquel on fait confiance tel quel — résolu à la volée
  // pour l'affichage via UserLookupService, jamais mis en cache localement.
  // Trois chemins possibles :
  //   A) prescripteurExterne=true + nom manuel → snapshot nom/prénom (texte)
  //   B) id fourni, pas marqué externe → utilisé tel quel comme prescripteurId
  //   C) prescripteurId absent/null → fallback DEFAULT_CHEF_SERVICE_USER_ID
  private resolvePrescripteurId(
    externalId: string | undefined,
    prescripteurExterne: boolean | undefined,
    externalNomManuel?: string,
    externalPrenomManuel?: string,
  ): {
    prescripteurId: string | null;
    prescripteurExterneNom: string | null;
    prescripteurExternePrenom: string | null;
  } {
    // ── Cas C : pas d'id du tout → CHEF_SERVICE par défaut ──────────
    if (!externalId) {
      const fallbackId = externalServicesConfig.defaultChefServiceUserId || null;
      if (fallbackId) {
        this.logger.log(
          `👤 Prescripteur null → CHEF_SERVICE par défaut (${fallbackId})`,
        );
      } else {
        this.logger.warn(
          '⚠️ Aucun prescripteur et DEFAULT_CHEF_SERVICE_USER_ID non configuré',
        );
      }
      return {
        prescripteurId: fallbackId,
        prescripteurExterneNom: null,
        prescripteurExternePrenom: null,
      };
    }

    // ── Cas A : prescripteur externe → snapshot ─────────────────────
    if (prescripteurExterne) {
      this.logger.log(
        `👤 Prescripteur externe ${externalId} → snapshot` +
          (externalNomManuel
            ? ` (${externalNomManuel} ${externalPrenomManuel ?? ''})`
            : ' (aucun nom)'),
      );
      return {
        prescripteurId: null,
        prescripteurExterneNom: externalNomManuel ?? null,
        prescripteurExternePrenom: externalPrenomManuel ?? null,
      };
    }

    // ── Cas B : id fourni par le service User → utilisé tel quel ────
    return {
      prescripteurId: externalId,
      prescripteurExterneNom: null,
      prescripteurExternePrenom: null,
    };
  }

  // ─── Construction d'une demande virtuelle (non persistée) ──────────
  private buildVirtualDemande(p: PrescriptionEegDemandeFlat) {
    return {
      id: p.id,
      numeroEEG: `PRESC-${p.id.slice(0, 8).toUpperCase()}`,
      patientId: p.patientId,
      prescripteurId: p.prescripteurId ?? null,
      prescripteurExterneNom: p.prescripteurNomManuel ?? null,
      prescripteurExternePrenom: p.prescripteurPrenomManuel ?? null,
      prescripteurExterne: p.prescripteurExterne ?? false,
      technicienId: null as string | null,
      // CHUA ne classe pas les examens EEG par sous-type — on ignore la
      // valeur externe et on force le type générique unique.
      typeEEG: 'EEG' as const,
      urgence: p.urgence ?? 'NORMALE',
      motifPrescription: p.renseignements ?? '',
      statut: 'CREEE' as const,
      episodeSoinsId: p.chuId ?? '',
      prescriptionSourceId: p.id,
      prescriptionParentId: p.prescriptionParentId,
      dateCreation: p.createdAt ? new Date(p.createdAt) : new Date(),
      dateRDV: null as Date | null,
      dateRealisation: null as Date | null,
      dateValidation: null as Date | null,
      motifAnnulation: null as string | null,
      aeActuel: p.aeActuel ?? null,
      agePremiereCrise: p.agePremiereCrise ?? null,
      dpm: p.dpm ?? null,
      typeCrise: p.typeCrise ?? null,
      dateDerniereCrise: p.dateDerniereCrise ?? null,
    };
  }

  // ─── Promotion vers la base locale ────────────────────────────────
  private async promoteToLocal(p: PrescriptionEegDemandeFlat) {
    this.logger.log(
      `📥 Demande reçue — id: ${p.id}, typeEEG: ${p.typeEEG}, ` +
        `prescripteurId: ${p.prescripteurId || '(vide)'}, ` +
        `externe: ${p.prescripteurExterne}, ` +
        `parent: ${p.prescriptionParentId}`,
    );

    const resolved = this.resolvePrescripteurId(
      p.prescripteurId,
      p.prescripteurExterne,
      p.prescripteurNomManuel,
      p.prescripteurPrenomManuel,
    );

    try {
      return await this.prisma.eegDemande.create({
        data: {
          patientId: p.patientId,
          prescripteurId: resolved.prescripteurId,
          prescripteurExterneNom: resolved.prescripteurExterneNom,
          prescripteurExternePrenom: resolved.prescripteurExternePrenom,
          prescripteurExterne: p.prescripteurExterne ?? false,
          // CHUA ne classe pas les examens EEG par sous-type — on ignore la
          // valeur externe et on force le type générique unique.
          typeEEG: 'EEG',
          urgence: p.urgence || 'NORMALE',
          motifPrescription: p.renseignements ?? '',
          episodeSoinsId: p.chuId || `EXTERNAL-${Date.now()}`,
          numeroEEG: `EEG-${Date.now()}`,
          prescriptionSourceId: p.id,
          prescriptionParentId: p.prescriptionParentId,
          // Sans ce champ, Prisma retombe sur son défaut (now()) — la date
          // enregistrée serait alors le moment de la SYNCHRONISATION (le
          // prochain chargement de la worklist ou passage du cron), pas le
          // vrai moment de création chez prescription_back. C'est ce qui
          // rendait les heures d'arrivée affichées fausses.
          dateCreation: p.createdAt ? new Date(p.createdAt) : new Date(),
          // Snapshot clinique pris à la prescription — affiché en lecture
          // seule à l'interprétation au lieu d'être ressaisi (voir
          // archiverResultat, qui les recopie ensuite dans EegResultat).
          aeActuel: p.aeActuel ?? null,
          agePremiereCrise: p.agePremiereCrise ?? null,
          dpm: p.dpm ?? null,
          typeCrise: p.typeCrise ?? null,
          dateDerniereCrise: p.dateDerniereCrise ?? null,
        },
        include: { rdv: true },
      });
    } catch (error) {
      this.logger.error(
        `Échec création EegDemande pour prescription source ${p.id}: ${getErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      const existant = await this.prisma.eegDemande.findUnique({
        where: { prescriptionSourceId: p.id },
        include: { rdv: true },
      });
      if (existant) return existant;
      throw new BadRequestException(
        'Échec de la prise en charge de la prescription',
      );
    }
  }

  // ─── Promotion + notification des demandes pas encore connues ─────
  // Partagé entre le cron de fond (syncPendingPrescriptions, token
  // statique) et getWorklist (token de l'utilisateur connecté).
  // Idempotent : une notification NOUVELLE_DEMANDE n'est jamais recréée
  // pour une demande déjà notifiée (protège contre les doubles appels
  // concurrents du cron et de getWorklist sur la même fenêtre).
  private async promouvoirNouvelles(
    flatDemandes: PrescriptionEegDemandeFlat[],
    sourceIdsConnus: Set<string>,
  ): Promise<number> {
    const nouvelles = flatDemandes.filter((d) => !sourceIdsConnus.has(d.id));

    for (const d of nouvelles) {
      const demande = await this.promoteToLocal(d);

      const dejaNotifie = await this.prisma.eegNotification.findFirst({
        where: { demandeId: demande.id, type: 'NOUVELLE_DEMANDE' },
      });
      if (dejaNotifie) continue;

      this.logger.log(
        `🔔 Notification locale pour ${demande.numeroEEG} (typeEEG: ${demande.typeEEG})`,
      );
      await this.prisma.eegNotification.create({
        data: {
          niveau: demande.urgence,
          type: 'NOUVELLE_DEMANDE',
          titre: 'Nouvelle demande EEG',
          message: `${demande.numeroEEG} — ${demande.typeEEG}`,
          patientId: demande.patientId,
          demandeId: demande.id,
          // Concerne le TECHNICIEN (à lui de planifier/réaliser) — pas le
          // CHEF_SERVICE, qui n'agit qu'une fois l'examen réalisé.
          roleCible: 'TECHNICIEN',
        },
      });
    }
    return nouvelles.length;
  }

  // ─── Sync des prescriptions en attente (cron, token statique) ──────
  async syncPendingPrescriptions(): Promise<number> {
    const [locales, flatDemandes] = await Promise.all([
      this.prisma.eegDemande.findMany({
        select: { prescriptionSourceId: true },
      }),
      this.prescriptionClient.listEegDemandes(),
    ]);

    const sourceIdsConnus = new Set(
      locales
        .map((d) => d.prescriptionSourceId)
        .filter((v): v is string => !!v),
    );

    return this.promouvoirNouvelles(flatDemandes, sourceIdsConnus);
  }

  // ─── Répercussion statut vers prescription_back ───────────────────
  private syncStatutToSource(
    prescriptionParentId: string | null,
    demandeSourceId: string | null,
    statut: string,
    motif?: string,
  ) {
    if (!prescriptionParentId || !demandeSourceId) return;
    void this.prescriptionClient.updateDemandeStatut(
      prescriptionParentId,
      demandeSourceId,
      statut,
      motif,
    );
  }

  // ─── Résolution ID → demande locale ou promotion ──────────────────
  private async resolveOrPromote(id: string, token?: string) {
    const local = await this.prisma.eegDemande.findFirst({
      where: { OR: [{ id }, { prescriptionSourceId: id }] },
      include: { rdv: true },
    });
    if (local) return local;

    const demande =
      await this.prescriptionClient.findDemandeEegById(id, token);
    if (!demande) throw new NotFoundException(`Demande ${id} introuvable`);
    return this.promoteToLocal(demande);
  }

  // ─── Worklist ─────────────────────────────────────────────────────
  // Détermine si une demande a un prescripteur renseigné (local ou externe).
  private aUnPrescripteur(d: {
    prescripteurId?: string | null;
    prescripteurExterneNom?: string | null;
    prescripteurExternePrenom?: string | null;
    prescripteurNomManuel?: string | null;
    prescripteurPrenomManuel?: string | null;
  }): boolean {
    if (d.prescripteurId) return true;
    if (d.prescripteurExterneNom || d.prescripteurExternePrenom) return true;
    if (d.prescripteurNomManuel || d.prescripteurPrenomManuel) return true;
    return false;
  }

  // ─── Heure d'arrivée = heure exacte de la notification correspondante ──
  // La worklist affichait dateCreation/dateRealisation/dateValidation —
  // des dates calculées indépendamment de la notification qui a réellement
  // alerté l'utilisateur, donc jamais garanties égales (ex: dateCreation
  // = heure de la prescription d'origine chez prescription_back, alors que
  // la notification NOUVELLE_DEMANDE n'est créée qu'au moment de la
  // synchronisation locale, potentiellement bien plus tard). On va donc
  // chercher l'horodatage réel de la notification associée à l'état actuel
  // de chaque demande, avec repli sur l'ancien comportement si elle
  // manque (données antérieures à l'introduction de ce système).
  private async attachHeureArrivee<
    T extends {
      id: string;
      statut: string;
      dateCreation: Date;
      dateRealisation: Date | null;
      dateValidation: Date | null;
    },
  >(demandes: T[]): Promise<(T & { heureArrivee: Date })[]> {
    if (demandes.length === 0) return [];

    const notifications = await this.prisma.eegNotification.findMany({
      where: {
        demandeId: { in: demandes.map((d) => d.id) },
        type: { in: ['NOUVELLE_DEMANDE', 'A_INTERPRETER'] },
      },
      orderBy: { horodatage: 'asc' },
      select: { demandeId: true, type: true, horodatage: true },
    });

    // orderBy asc + Map écrase avec la dernière valeur lue : on garde donc
    // la PREMIÈRE notification de ce type pour cette demande (la plus
    // proche de l'arrivée réelle), pas une éventuelle répétition tardive.
    const horodatageParCle = new Map<string, Date>();
    for (const n of notifications) {
      const cle = `${n.demandeId}:${n.type}`;
      if (!horodatageParCle.has(cle)) horodatageParCle.set(cle, n.horodatage);
    }

    return demandes.map((d) => {
      let heureArrivee = d.dateCreation;
      if (d.statut === 'EN_COURS') {
        heureArrivee =
          horodatageParCle.get(`${d.id}:A_INTERPRETER`) ??
          d.dateRealisation ??
          d.dateCreation;
      } else if (d.statut === 'RESULTAT_DISPONIBLE') {
        heureArrivee = d.dateValidation ?? d.dateCreation;
      } else {
        heureArrivee =
          horodatageParCle.get(`${d.id}:NOUVELLE_DEMANDE`) ?? d.dateCreation;
      }
      return { ...d, heureArrivee };
    });
  }

  async getWorklist(role: string, token?: string) {
    if (!['TECHNICIEN', 'CHEF_SERVICE', 'MAJOR_SERVICE'].includes(role)) {
      return { message: 'Rôle non reconnu' };
    }

    const [connues, flatDemandes] = await Promise.all([
      this.prisma.eegDemande.findMany({
        select: { prescriptionSourceId: true },
      }),
      this.prescriptionClient.listEegDemandes(undefined, undefined, token),
    ]);

    const sourceIdsConnus = new Set(
      connues
        .map((d) => d.prescriptionSourceId)
        .filter((v): v is string => !!v),
    );

    // Promeut et notifie immédiatement toute nouvelle prescription vue ici,
    // avec le token de l'utilisateur connecté — sans attendre le prochain
    // passage du cron (qui, lui, dépend d'un token statique plus fragile).
    await this.promouvoirNouvelles(flatDemandes, sourceIdsConnus);

    const locales = await this.prisma.eegDemande.findMany({
      include: { resultat: true, rdv: true },
      orderBy: { dateCreation: 'desc' },
    });

    const toutes = locales.filter(
      (d) =>
        !['RESULTAT_DISPONIBLE', 'ANNULEE'].includes(d.statut) &&
        this.aUnPrescripteur(d),
    );

    const avecHeure = await this.attachHeureArrivee(toutes);
    const avecPatient = await this.patientLookup.attachPatientInfoToMany(avecHeure);
    return { toutes: await this.userLookup.attachPrescripteurInfoToMany(avecPatient) };
  }

  // ─── Détail d'une demande ─────────────────────────────────────────
  async getDemandeById(id: string, token?: string) {
    const local = await this.prisma.eegDemande.findFirst({
      where: { OR: [{ id }, { prescriptionSourceId: id }] },
      include: { resultat: true, rdv: true },
    });
    if (local) {
      const [avecHeure] = await this.attachHeureArrivee([local]);
      const avecPatient = await this.patientLookup.attachPatientInfo(avecHeure);
      return this.userLookup.attachPrescripteurInfo(avecPatient);
    }

    const demande =
      await this.prescriptionClient.findDemandeEegById(id, token);
    if (!demande) throw new NotFoundException(`Demande ${id} introuvable`);
    const avecPatient = await this.patientLookup.attachPatientInfo(
      this.buildVirtualDemande(demande),
    );
    return this.userLookup.attachPrescripteurInfo(avecPatient);
  }

  async getDemandesByPatient(patientId: string) {
    const demandes = await this.prisma.eegDemande.findMany({
      where: { patientId },
      include: { resultat: true },
      orderBy: { dateCreation: 'desc' },
    });
    return this.patientLookup.attachPatientInfoToMany(demandes);
  }

  // ─── Actions sur les demandes ─────────────────────────────────────
  async refuserDemande(
    id: string,
    motif: string,
    technicienId: string,
    token?: string,
  ) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.resolveOrPromote(id, token);
    if (d.statut !== 'CREEE')
      throw new BadRequestException(`Statut invalide: ${d.statut}`);
    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: { statut: 'ANNULEE', motifAnnulation: motif, technicienId },
    });
    this.syncStatutToSource(
      d.prescriptionParentId,
      d.prescriptionSourceId,
      'ANNULEE',
      motif,
    );
    return demandeMaj;
  }

  async annulerDemande(id: string, motif: string, token?: string) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.resolveOrPromote(id, token);
    if (['ANNULEE', 'RESULTAT_DISPONIBLE'].includes(d.statut)) {
      throw new BadRequestException(
        `Impossible d'annuler une demande ${d.statut}`,
      );
    }
    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: { statut: 'ANNULEE', motifAnnulation: motif },
    });
    this.syncStatutToSource(
      d.prescriptionParentId,
      d.prescriptionSourceId,
      'ANNULEE',
      motif,
    );
    return demandeMaj;
  }

  async planifierRdv(
    id: string,
    dto: PlanifierRdvDto,
    technicienId: string,
    token?: string,
  ) {
    const d = await this.resolveOrPromote(id, token);
    if (d.statut !== 'CREEE')
      throw new BadRequestException(`Statut invalide: ${d.statut}`);

    const dateRdv = new Date(dto.dateRDV);
    if (estWeekend(dateRdv)) {
      throw new BadRequestException(
        'Impossible de planifier un RDV le week-end',
      );
    }
    const conflit = await this.prisma.eegRdv.findFirst({
      where: {
        dateRdv,
        heureDebut: dto.heureDebut,
        statut: { notIn: ['ANNULE', 'NON_REALISE'] },
      },
    });
    if (conflit) throw new BadRequestException('Créneau déjà occupé');

    const dureeMinutes = dto.dureeMinutes ?? 60;
    const heureFin = ajouterMinutes(dto.heureDebut, dureeMinutes);

    // EegRdv.prescripteurId est nullable — si la demande n'a pas de
    // prescripteur, on utilise le CHEF_SERVICE par défaut (configuré).
    const prescripteurIdRdv =
      d.prescripteurId ?? externalServicesConfig.defaultChefServiceUserId ?? '';

    await this.prisma.eegRdv.create({
      data: {
        patientId: d.patientId,
        prescripteurId: prescripteurIdRdv,
        demandeId: d.id,
        typeEEG: d.typeEEG,
        priorite: d.urgence,
        dateRdv,
        heureDebut: dto.heureDebut,
        heureFin,
        dureeMinutes,
        renseignementClinique: d.motifPrescription,
      },
    });

    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: { statut: 'PLANIFIEE', dateRDV: dateRdv, technicienId },
    });
    this.syncStatutToSource(
      d.prescriptionParentId,
      d.prescriptionSourceId,
      'PLANIFIEE',
    );
    return demandeMaj;
  }

  async realiserDemande(id: string, techId: string, token?: string) {
    const d = await this.resolveOrPromote(id, token);
    if (!(
      (d.statut === 'CREEE' && d.urgence === 'STAT') ||
      d.statut === 'PLANIFIEE'
    )) {
      throw new BadRequestException(`Statut invalide: ${d.statut}`);
    }

    if (d.rdv) {
      const statutRdv = (d.rdv as { statut?: string }).statut;
      if (statutRdv === 'ANNULE' || statutRdv === 'NON_REALISE') {
        throw new BadRequestException(
          'Impossible de réaliser cette demande : le rendez-vous associé est annulé ou non réalisé',
        );
      }
    }

    const maintenant = new Date();
    // Le RDV lié (s'il existe) doit passer à REALISE en même temps que la
    // demande — sans ça, EegRdv restait bloqué à EN_ATTENTE indéfiniment :
    // le seul endpoint qui le faisait passer à REALISE (PATCH .../realiser)
    // n'était appelé par aucune action du front.
    const [demandeMaj] = await this.prisma.$transaction([
      this.prisma.eegDemande.update({
        where: { id: d.id },
        data: {
          statut: 'EN_COURS',
          dateRealisation: maintenant,
          technicienId: techId,
        },
      }),
      ...(d.rdv
        ? [
            this.prisma.eegRdv.update({
              where: { id: d.rdv.id },
              data: {
                statut: 'REALISE',
                dateRealisation: maintenant,
                technicienRealisateurId: techId,
              },
            }),
          ]
        : []),
    ]);
    this.syncStatutToSource(
      d.prescriptionParentId,
      d.prescriptionSourceId,
      'EN_COURS',
    );

    // Notification interactive du transfert TECHNICIEN -> CHEF_SERVICE :
    // sans ça, seule l'alerte "non interprété depuis 24h" (cron) existait,
    // bien trop tardive pour un examen qui vient d'être réalisé.
    await this.prisma.eegNotification.create({
      data: {
        niveau: demandeMaj.urgence,
        type: 'A_INTERPRETER',
        titre: 'Examen à interpréter',
        message: `${demandeMaj.numeroEEG} — examen réalisé, prêt à interpréter`,
        patientId: demandeMaj.patientId,
        demandeId: demandeMaj.id,
        roleCible: 'CHEF_SERVICE',
      },
    });

    return demandeMaj;
  }

  async archiverResultat(
    id: string,
    compteRendu: ArchiverResultatDto,
    chefId: string,
  ) {
    const d = await this.getDemandeById(id);
    if (d.statut !== 'EN_COURS')
      throw new BadRequestException(`Statut invalide: ${d.statut}`);

    const existant = await this.prisma.eegResultat.findUnique({
      where: { demandeId: id },
    });

    if (existant?.estImmutable) {
      throw new BadRequestException(
        'Ce résultat est déjà archivé (utiliser la rectification pour le corriger)',
      );
    }

    // CLINIQUE : sourcé depuis la demande (snapshot pris à la prescription
    // chez prescription_back — voir promoteToLocal), pas depuis le
    // formulaire. Le CHEF_SERVICE n'a plus à ressaisir des informations
    // déjà fournies par le prescripteur ; seul `autresRc` reste sa saisie.
    const data = {
      aeActuel: d.aeActuel ?? null,
      age1ereCrise: d.agePremiereCrise ?? null,
      dpm: d.dpm ?? null,
      typeCrises: d.typeCrise ?? null,
      autresRc: compteRendu.autresRc ?? null,
      dateDerniereCrise: d.dateDerniereCrise ?? null,
      activiteDeFond: compteRendu.activiteDeFond ?? null,
      anomaliesAuRepos: compteRendu.anomaliesAuRepos ?? null,
      testActivationHpn: compteRendu.testActivationHpn ?? null,
      testActivationSli: compteRendu.testActivationSli ?? null,
      conclusion: compteRendu.conclusion ?? null,
      conduiteATenir: compteRendu.conduiteATenir ?? null,
      estCritique: compteRendu.estCritique ?? false,
      estImmutable: true,
      dateValidation: new Date(),
    };

    if (existant) {
      await this.prisma.eegResultat.update({ where: { demandeId: id }, data });
    } else {
      await this.prisma.eegResultat.create({
        data: { demandeId: id, ...data, medecinValidateurId: chefId },
      });
    }

    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id },
      data: { statut: 'RESULTAT_DISPONIBLE', dateValidation: new Date() },
    });
    this.syncStatutToSource(
      d.prescriptionParentId,
      d.prescriptionSourceId,
      'RESULTAT_DISPONIBLE',
    );

    this.notificationService
      .sendNotification({
        type: 'RESULTAT_DISPONIBLE',
        motif: `Résultat EEG disponible pour la demande ${demandeMaj.numeroEEG}`,
        urgence: d.urgence,
        sourceServiceId: externalServicesConfig.eegServiceId,
        sourceServiceName: 'EEG',
        patientId: demandeMaj.patientId,
        sentAt: new Date().toISOString(),
      })
      .catch((err: unknown) =>
        console.error('Erreur notification:', getErrorMessage(err)),
      );

    return demandeMaj;
  }
}
