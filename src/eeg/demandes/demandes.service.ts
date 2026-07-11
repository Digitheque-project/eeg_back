import { NotificationExternalService } from '../external/notification-external.service';
import {
  PrescriptionClientService,
  PrescriptionEegDto,
} from '../external/prescription-client.service';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { getErrorMessage } from '../../common/utils/error.util';
import { PlanifierRdvDto } from './dto/planifier-rdv.dto';
import { ArchiverResultatDto } from './dto/archiver-resultat.dto';

@Injectable()
export class DemandesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationExternalService,
    private readonly patientLookup: PatientLookupService,
    private readonly prescriptionClient: PrescriptionClientService,
  ) {}

  /**
   * Une prescription CREEE tant qu'aucun technicien n'a agi dessus n'est
   * jamais stockée localement : elle est représentée à la volée depuis le
   * service Prescription (source de vérité). Elle apparaît/disparaît donc
   * immédiatement selon ce que ce service renvoie.
   */
  private buildVirtualDemande(p: PrescriptionEegDto) {
    return {
      id: p.id,
      numeroEEG: `PRESC-${p.id.slice(0, 8).toUpperCase()}`,
      patientId: p.patientId,
      prescripteurId: p.prescripteurId,
      technicienId: null as string | null,
      typeEEG: p.typeEEG,
      urgence: p.urgence ?? 'NORMALE',
      motifPrescription: p.renseignements,
      statut: 'CREEE' as const,
      episodeSoinsId: p.chuId ?? '',
      prescriptionSourceId: p.id,
      dateCreation: p.createdAt ? new Date(p.createdAt) : new Date(),
      dateRDV: null as Date | null,
      dateRealisation: null as Date | null,
      dateValidation: null as Date | null,
      motifAnnulation: null as string | null,
    };
  }

  /**
   * Crée l'enregistrement local au moment (et seulement au moment) où un
   * technicien agit sur une prescription encore virtuelle. Idempotent :
   * si un doublon est créé en concurrence, on retombe sur celui déjà promu.
   */
  private async promoteToLocal(p: PrescriptionEegDto) {
    // Le service Prescription n'expose qu'un identifiant libre pour le
    // prescripteur (pas de nom/prénom résolvable) — on l'affiche tel quel
    // plutôt qu'un placeholder générique qui masquerait qui a prescrit.
    // Certaines prescriptions arrivent avec prescripteurId vide (donnée
    // source incomplète) — on leur donne un id/libellé dédié plutôt que de
    // les faire toutes fusionner sous une même fiche "".
    const prescripteurId = p.prescripteurId || `INCONNU-${p.id}`;
    const prescripteurNom = p.prescripteurId || 'Prescripteur non renseigné';
    await this.prisma.utilisateur.upsert({
      where: { id: prescripteurId },
      update: {},
      create: {
        id: prescripteurId,
        nom: prescripteurNom,
        prenom: 'Externe',
        email: `prescripteur-${prescripteurId}@chu.local`,
        role: 'TECHNICIEN',
        actif: true,
      },
    });

    try {
      return await this.prisma.eegDemande.create({
        data: {
          patientId: p.patientId,
          prescripteurId,
          typeEEG: p.typeEEG,
          urgence: p.urgence || 'NORMALE',
          motifPrescription: p.renseignements,
          episodeSoinsId: p.chuId || `EXTERNAL-${Date.now()}`,
          numeroEEG: `EEG-${Date.now()}`,
          prescriptionSourceId: p.id,
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

  /**
   * Matérialise en local toute prescription EEG pas encore promue — appelée
   * par EegSchedulerService pour que la base locale reste la source de
   * vérité pour les rapports et les alertes (elles ne portent que sur des
   * demandes locales), sans attendre qu'un technicien agisse dessus.
   */
  async syncPendingPrescriptions(): Promise<number> {
    const [locales, prescriptions] = await Promise.all([
      this.prisma.eegDemande.findMany({
        select: { prescriptionSourceId: true },
      }),
      this.prescriptionClient.listEegPrescriptions(),
    ]);
    const sourceIdsConnus = new Set(
      locales
        .map((d) => d.prescriptionSourceId)
        .filter((v): v is string => !!v),
    );
    const nouvelles = prescriptions.filter((p) => !sourceIdsConnus.has(p.id));
    for (const p of nouvelles) {
      await this.promoteToLocal(p);
    }
    return nouvelles.length;
  }

  /**
   * Répercute un changement de statut EEG sur la prescription source, pour
   * que le prescripteur voie l'évolution (et le motif de refus/annulation)
   * dans le service Prescription. Fire-and-forget — un échec de sync ne doit
   * jamais bloquer le workflow EEG local.
   */
  private syncStatutToSource(
    prescriptionSourceId: string | null,
    statut: string,
    motif?: string,
  ) {
    if (!prescriptionSourceId) return;
    void this.prescriptionClient.updateStatut(
      prescriptionSourceId,
      statut,
      motif,
    );
  }

  /**
   * Résout un id vers une demande locale (déjà promue) ou, s'il s'agit d'un
   * id de prescription encore virtuelle, la promeut à la demande.
   */
  private async resolveOrPromote(id: string) {
    const local = await this.prisma.eegDemande.findFirst({
      where: { OR: [{ id }, { prescriptionSourceId: id }] },
      include: { rdv: true },
    });
    if (local) return local;

    const prescription =
      await this.prescriptionClient.findEegPrescriptionById(id);
    if (!prescription) throw new NotFoundException(`Demande ${id} introuvable`);
    return this.promoteToLocal(prescription);
  }

  async getWorklist(role: string) {
    if (!['TECHNICIEN', 'CHEF_SERVICE', 'MAJOR_SERVICE'].includes(role)) {
      return { message: 'Rôle non reconnu' };
    }

    const [locales, prescriptions] = await Promise.all([
      this.prisma.eegDemande.findMany({
        include: { prescripteur: true, resultat: true, rdv: true },
        orderBy: { dateCreation: 'desc' },
      }),
      this.prescriptionClient.listEegPrescriptions(),
    ]);

    const sourceIdsConnus = new Set(
      locales
        .map((d) => d.prescriptionSourceId)
        .filter((v): v is string => !!v),
    );
    const virtuelles = prescriptions
      .filter((p) => !sourceIdsConnus.has(p.id))
      .map((p) => this.buildVirtualDemande(p));

    // Un dossier clos (résultat archivé ou demande annulée/refusée) n'a plus
    // sa place dans le fil de travail — il reste consultable depuis la page
    // Archives. On l'exclut ici (et non de la requête ci-dessus) pour que la
    // déduplication par prescriptionSourceId reste correcte.
    const localesActives = locales.filter(
      (d) => !['RESULTAT_DISPONIBLE', 'ANNULEE'].includes(d.statut),
    );

    const toutes = [...localesActives, ...virtuelles].sort(
      (a, b) =>
        new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime(),
    );

    return { toutes: await this.patientLookup.attachPatientInfoToMany(toutes) };
  }

  async getDemandeById(id: string) {
    const local = await this.prisma.eegDemande.findFirst({
      where: { OR: [{ id }, { prescriptionSourceId: id }] },
      include: { prescripteur: true, resultat: true, rdv: true },
    });
    if (local) return this.patientLookup.attachPatientInfo(local);

    const prescription =
      await this.prescriptionClient.findEegPrescriptionById(id);
    if (!prescription) throw new NotFoundException(`Demande ${id} introuvable`);
    return this.patientLookup.attachPatientInfo(
      this.buildVirtualDemande(prescription),
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

  async refuserDemande(id: string, motif: string, technicienId: string) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.resolveOrPromote(id);
    if (d.statut !== 'CREEE')
      throw new BadRequestException(`Statut invalide: ${d.statut}`);
    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: { statut: 'ANNULEE', motifAnnulation: motif, technicienId },
    });
    this.syncStatutToSource(d.prescriptionSourceId, 'ANNULEE', motif);
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
    this.syncStatutToSource(d.prescriptionSourceId, 'ANNULEE', motif);
    return demandeMaj;
  }

  async planifierRdv(id: string, dto: PlanifierRdvDto, technicienId: string) {
    const d = await this.resolveOrPromote(id);
    if (d.statut !== 'CREEE')
      throw new BadRequestException(`Statut invalide: ${d.statut}`);

    // Si créneau fourni explicitement, l'utiliser directement
    if (dto.dateRDV && dto.heureDebut && dto.salle) {
      const dateRdv = new Date(dto.dateRDV);
      const conflit = await this.prisma.eegRdv.findFirst({
        where: {
          dateRdv: dateRdv,
          heureDebut: dto.heureDebut,
          salle: dto.salle,
        },
      });
      if (conflit) throw new BadRequestException('Créneau déjà occupé');

      const heureNum = parseInt(dto.heureDebut.split(':')[0]);
      const heureFin = `${String(heureNum + 1).padStart(2, '0')}:00`;

      await this.prisma.eegRdv.create({
        data: {
          patientId: d.patientId,
          prescripteurId: d.prescripteurId,
          demandeId: d.id,
          typeEEG: d.typeEEG,
          salle: dto.salle,
          priorite: d.urgence,
          dateRdv: dateRdv,
          heureDebut: dto.heureDebut,
          heureFin: heureFin,
          dureeMinutes: 60,
          renseignementClinique: d.motifPrescription,
        },
      });

      const demandeMaj = await this.prisma.eegDemande.update({
        where: { id: d.id },
        data: { statut: 'PLANIFIEE', dateRDV: dateRdv, technicienId },
      });
      this.syncStatutToSource(d.prescriptionSourceId, 'PLANIFIEE');
      return demandeMaj;
    }

    const maintenant = new Date();
    const jPlus2 = new Date(maintenant);
    jPlus2.setDate(maintenant.getDate() + 2);
    jPlus2.setHours(0, 0, 0, 0);

    const rdvsExistants = await this.prisma.eegRdv.findMany({
      where: { dateRdv: { gte: jPlus2 } },
      select: { dateRdv: true, heureDebut: true, salle: true },
      orderBy: { dateRdv: 'asc' },
    });

    const salles = ['Salle 01', 'Salle 02', 'Salle 03'];
    let dateChoisie: Date | null = null;
    let heureDebut = '08:00';
    let salleChoisie = 'Salle 01';
    let trouve = false;

    for (let j = 0; j < 30 && !trouve; j++) {
      const date = new Date(jPlus2);
      date.setDate(jPlus2.getDate() + j);
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      for (const salle of salles) {
        for (let h = 8; h < 17 && !trouve; h++) {
          const debut = `${String(h).padStart(2, '0')}:00`;
          const occupe = rdvsExistants.some((r) => {
            if (!r || !r.salle || !r.heureDebut || !r.dateRdv) return false;
            const rDate = new Date(r.dateRdv).toDateString();
            return (
              rDate === date.toDateString() &&
              r.salle === salle &&
              r.heureDebut === debut
            );
          });
          if (!occupe) {
            dateChoisie = new Date(date);
            heureDebut = debut;
            salleChoisie = salle;
            trouve = true;
          }
        }
      }
    }

    if (!trouve || !dateChoisie)
      throw new BadRequestException('Aucun créneau disponible trouvé');

    const heureNum = parseInt(heureDebut.split(':')[0]);
    const fin = `${String(heureNum + 1).padStart(2, '0')}:00`;

    await this.prisma.eegRdv.create({
      data: {
        patientId: d.patientId,
        prescripteurId: d.prescripteurId,
        demandeId: d.id,
        typeEEG: d.typeEEG,
        salle: salleChoisie,
        priorite: d.urgence,
        dateRdv: dateChoisie,
        heureDebut,
        heureFin: fin,
        dureeMinutes: 60,
        renseignementClinique: d.motifPrescription,
      },
    });

    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: { statut: 'PLANIFIEE', dateRDV: dateChoisie, technicienId },
    });
    this.syncStatutToSource(d.prescriptionSourceId, 'PLANIFIEE');
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

    // Vérification de la cohérence avec le RDV lié (Phase 4)
    // Si un RDV est associé à la demande, son statut ne doit pas être ANNULE ou NON_REALISE
    if (d.rdv) {
      const statutRdv = (d.rdv as { statut?: string }).statut;
      if (statutRdv === 'ANNULE' || statutRdv === 'NON_REALISE') {
        throw new BadRequestException(
          'Impossible de réaliser cette demande : le rendez-vous associé est annulé ou non réalisé',
        );
      }
    }
    // Si aucun RDV n'est lié (ex. demande CREEE + STAT), la vérification est ignorée

    const demandeMaj = await this.prisma.eegDemande.update({
      where: { id: d.id },
      data: {
        statut: 'EN_COURS',
        dateRealisation: new Date(),
        technicienId: techId,
      },
    });
    this.syncStatutToSource(d.prescriptionSourceId, 'EN_COURS');
    return demandeMaj;
  }

  /**
   * Le chef de service interprète le résultat et l'archive en une seule action
   * (plus d'étape de validation séparée). Une notification "résultat disponible"
   * est envoyée automatiquement — il n'y a plus d'accusé de réception manuel.
   */
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
    this.syncStatutToSource(d.prescriptionSourceId, 'RESULTAT_DISPONIBLE');

    // Notification automatique de résultat disponible (remplace l'ancien accusé de réception manuel)
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
