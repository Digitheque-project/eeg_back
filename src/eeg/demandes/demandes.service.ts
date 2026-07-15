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
import { getErrorMessage } from '../../common/utils/error.util';
import { estWeekend, ajouterMinutes } from '../../common/utils/date.util';
import { PlanifierRdvDto } from './dto/planifier-rdv.dto';
import { ArchiverResultatDto } from './dto/archiver-resultat.dto';

@Injectable()
export class DemandesService {
  private readonly logger = new Logger(DemandesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationExternalService,
    private readonly patientLookup: PatientLookupService,
    private readonly prescriptionClient: PrescriptionClientService,
  ) {}

  // ─── Prescripteur par défaut (CHEF_SERVICE actif) ─────────────────
  private async getDefaultPrescripteurId(): Promise<string | null> {
    const u = await this.prisma.utilisateur.findFirst({
      where: { role: 'CHEF_SERVICE', actif: true },
    });
    return u?.id ?? null;
  }

  // ─── Résolution prescripteur externe (Option B) ───────────────────
  // Trois chemins possibles :
  //   A) prescripteurExterne=true + l'id n'existe pas localement → snapshot
  //   B) prescripteurExterne=false (ou absent) + l'id existe localement → réutilise l'id local
  //   C) prescripteurId absent/null → fallback CHEF_SERVICE
  //
  // Cas particulier : prescripteurExterne=true mais prescripteurNomManuel=null
  // → on ne peut pas afficher de nom, on laisse les snapshot à null.
  // Le frontend affichera "Non renseigné".
  private async resolvePrescripteurId(
    externalId: string | undefined,
    prescripteurExterne: boolean | undefined,
    externalNomManuel?: string,
    externalPrenomManuel?: string,
  ): Promise<{
    prescripteurId: string | null;
    prescripteurExterneNom: string | null;
    prescripteurExternePrenom: string | null;
  }> {
    // ── Cas C : pas d'id du tout → CHEF_SERVICE par défaut ──────────
    if (!externalId) {
      const fallbackId = await this.getDefaultPrescripteurId();
      if (fallbackId) {
        this.logger.log(
          `👤 Prescripteur null → CHEF_SERVICE par défaut (${fallbackId})`,
        );
      } else {
        this.logger.warn(
          '⚠️ Aucun prescripteur et aucun CHEF_SERVICE actif trouvé',
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

    // ── Cas B : id fourni, pas marqué externe → cherche localement ──
    const local = await this.prisma.utilisateur.findUnique({
      where: { id: externalId },
    });
    if (local) {
      this.logger.log(
        `👤 Prescripteur local trouvé: ${local.prenom} ${local.nom} (${local.id})`,
      );
      return {
        prescripteurId: local.id,
        prescripteurExterneNom: null,
        prescripteurExternePrenom: null,
      };
    }

    // ── Cas B (fallback) : id fourni mais absent de la table locale ─
    // Cela ne devrait pas arriver si prescripteurExterne=true, mais par
    // sécurité on traite ça comme un externe sans nom.
    this.logger.warn(
      `⚠️ prescripteurId ${externalId} absent de la table locale, ` +
        `prescripteurExterne=false → traitement comme externe sans nom`,
    );
    return {
      prescripteurId: null,
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
      prescripteurId: null as string | null,
      prescripteurExterneNom: p.prescripteurNomManuel ?? null,
      prescripteurExternePrenom: p.prescripteurPrenomManuel ?? null,
      prescripteurExterne: p.prescripteurExterne ?? false,
      technicienId: null as string | null,
      typeEEG: p.typeEEG,
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

    const resolved = await this.resolvePrescripteurId(
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
          typeEEG: p.typeEEG,
          urgence: p.urgence || 'NORMALE',
          motifPrescription: p.renseignements ?? '',
          episodeSoinsId: p.chuId || `EXTERNAL-${Date.now()}`,
          numeroEEG: `EEG-${Date.now()}`,
          prescriptionSourceId: p.id,
          prescriptionParentId: p.prescriptionParentId,
        },
        include: { rdv: true },
      });
    } catch {
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

  // ─── Sync des prescriptions en attente ────────────────────────────
  async syncPendingPrescriptions(): Promise<number> {
    const [locales, flatDemandes] = await Promise.all([
      this.prisma.eegDemande.findMany({
        select: { prescriptionParentId: true },
      }),
      this.prescriptionClient.listEegDemandes(),
    ]);

    const parentIdsConnus = new Set(
      locales
        .map((d) => d.prescriptionParentId)
        .filter((v): v is string => !!v),
    );

    const nouvelles = flatDemandes.filter(
      (d) => !parentIdsConnus.has(d.prescriptionParentId),
    );

    for (const d of nouvelles) {
      const demande = await this.promoteToLocal(d);
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
        },
      });
    }
    return nouvelles.length;
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
  private async resolveOrPromote(id: string) {
    const local = await this.prisma.eegDemande.findFirst({
      where: { OR: [{ id }, { prescriptionSourceId: id }] },
      include: { rdv: true },
    });
    if (local) return local;

    const demande =
      await this.prescriptionClient.findDemandeEegById(id);
    if (!demande) throw new NotFoundException(`Demande ${id} introuvable`);
    return this.promoteToLocal(demande);
  }

  // ─── Worklist ─────────────────────────────────────────────────────
  async getWorklist(role: string) {
    if (!['TECHNICIEN', 'CHEF_SERVICE', 'MAJOR_SERVICE'].includes(role)) {
      return { message: 'Rôle non reconnu' };
    }

    const [locales, flatDemandes] = await Promise.all([
      this.prisma.eegDemande.findMany({
        include: { prescripteur: true, resultat: true, rdv: true },
        orderBy: { dateCreation: 'desc' },
      }),
      this.prescriptionClient.listEegDemandes(),
    ]);

    const parentIdsConnus = new Set(
      locales
        .map((d) => d.prescriptionParentId)
        .filter((v): v is string => !!v),
    );

    const virtuelles = flatDemandes
      .filter((d) => !parentIdsConnus.has(d.prescriptionParentId))
      .map((d) => this.buildVirtualDemande(d));

    const localesActives = locales.filter(
      (d) => !['RESULTAT_DISPONIBLE', 'ANNULEE'].includes(d.statut),
    );

    const toutes = [...localesActives, ...virtuelles].sort(
      (a, b) =>
        new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime(),
    );

    return { toutes: await this.patientLookup.attachPatientInfoToMany(toutes) };
  }

  // ─── Détail d'une demande ─────────────────────────────────────────
  async getDemandeById(id: string) {
    const local = await this.prisma.eegDemande.findFirst({
      where: { OR: [{ id }, { prescriptionSourceId: id }] },
      include: { prescripteur: true, resultat: true, rdv: true },
    });
    if (local) return this.patientLookup.attachPatientInfo(local);

    const demande =
      await this.prescriptionClient.findDemandeEegById(id);
    if (!demande) throw new NotFoundException(`Demande ${id} introuvable`);
    return this.patientLookup.attachPatientInfo(
      this.buildVirtualDemande(demande),
    );
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
  async refuserDemande(id: string, motif: string, technicienId: string) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.resolveOrPromote(id);
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

  async annulerDemande(id: string, motif: string) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.resolveOrPromote(id);
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

  async planifierRdv(id: string, dto: PlanifierRdvDto, technicienId: string) {
    const d = await this.resolveOrPromote(id);
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
    // prescripteur local, on utilise le CHEF_SERVICE par défaut.
    const prescripteurIdRdv =
      d.prescripteurId ?? (await this.getDefaultPrescripteurId()) ?? '';

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

  async realiserDemande(id: string, techId: string) {
    const d = await this.resolveOrPromote(id);
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

    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: {
        statut: 'EN_COURS',
        dateRealisation: new Date(),
        technicienId: techId,
      },
    });
    this.syncStatutToSource(
      d.prescriptionParentId,
      d.prescriptionSourceId,
      'EN_COURS',
    );
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

    const data = {
      aeActuel: compteRendu.aeActuel ?? null,
      age1ereCrise: compteRendu.age1ereCrise ?? null,
      dpm: compteRendu.dpm ?? null,
      typeCrises: compteRendu.typeCrises ?? null,
      autresRc: compteRendu.autresRc ?? null,
      dateDerniereCrise: compteRendu.dateDerniereCrise ?? null,
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
        urgence: d.urgence === 'STAT' ? 3 : d.urgence === 'URGENTE' ? 2 : 1,
        sourceServiceId: process.env.EEG_SERVICE_ID,
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
