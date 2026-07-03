import { NotificationExternalService } from "../external/notification-external.service";
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';

@Injectable()
export class DemandesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationExternalService,
    private readonly patientLookup: PatientLookupService,
  ) {}

  private async enrichDemandePatient(demande: any) {
    if (!demande || !demande.patient) return demande;
    if (!demande.patient.isExternal) return demande;
    const info = await this.patientLookup.getPatientInfoWithExternalLookup(demande.patient);
    return {
      ...demande,
      patient: {
        ...demande.patient,
        nom: info.nom,
        prenom: info.prenom,
        age: info.age,
        sexe: info.sexe
      }
    };
  }

  private async enrichDemandes(demandes: any[]) {
    return Promise.all(demandes.map(d => this.enrichDemandePatient(d)));
  }

  async getWorklist(role: string) {
    switch (role) {
      case 'MEDECIN_SERVICE':
        return {
          aValider: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'CREEE' },
            include: { patient: true, prescripteur: true },
            orderBy: { dateCreation: 'asc' },
          })),
          aInterpreter: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'EN_COURS' },
            include: { patient: true, prescripteur: true, resultat: true },
            orderBy: { dateRealisation: 'asc' },
          })),
        };
      case 'TECHNICIEN':
        return {
          statUrgents: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'CREEE', urgence: 'STAT' },
            include: { patient: true },
            orderBy: { dateCreation: 'asc' },
          })),
          rdvDuJour: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'PLANIFIEE' },
            include: { patient: true, rdv: true },
            orderBy: { dateRDV: 'asc' },
          })),
        };
      case 'CHEF_SERVICE':
        return {
          aValider: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'CREEE' },
            include: { patient: true, prescripteur: true },
            orderBy: [{ urgence: 'asc' }, { dateCreation: 'asc' }],
          })),
          aPlanifier: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'VALIDEE' },
            include: { patient: true },
            orderBy: { dateCreation: 'asc' },
          })),
          aValiderCR: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            where: { statut: 'EN_INTERPRETATION' },
            include: { patient: true, resultat: true },
            orderBy: { dateCreation: 'asc' },
          })),
        };
      case 'MAJOR_SERVICE':
        return {
          toutes: await this.enrichDemandes(await this.prisma.eegDemande.findMany({
            include: { patient: true, prescripteur: true, resultat: true, rdv: true },
            orderBy: { dateCreation: 'desc' },
            take: 50,
          })),
        };
      default:
        return { message: 'Rôle non reconnu' };
    }
  }

  async getDemandeById(id: string) {
    const d = await this.prisma.eegDemande.findUnique({
      where: { id },
      include: { patient: true, prescripteur: true, resultat: true, rdv: true },
    });
    if (!d) throw new NotFoundException(`Demande ${id} introuvable`);
    return this.enrichDemandePatient(d);
  }

  async getDemandesByPatient(patientId: string) {
    const demandes = await this.prisma.eegDemande.findMany({
      where: { patientId },
      include: { resultat: true, patient: true },
      orderBy: { dateCreation: 'desc' },
    });
    return this.enrichDemandes(demandes);
  }

  async validerDemande(id: string, medecinId: string) {
    const d = await this.getDemandeById(id);
    if (d.statut !== 'CREEE') throw new BadRequestException(`Statut invalide: ${d.statut}`);
    return this.prisma.eegDemande.update({ where: { id }, data: { statut: 'VALIDEE' } });
  }

  async refuserDemande(id: string, motif: string, medecinId: string) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.getDemandeById(id);
    if (d.statut !== 'CREEE') throw new BadRequestException(`Statut invalide: ${d.statut}`);
    return this.prisma.eegDemande.update({ where: { id }, data: { statut: 'ANNULEE', motifAnnulation: motif } });
  }

  async annulerDemande(id: string, motif: string, userId: string) {
    if (!motif?.trim()) throw new BadRequestException('Motif obligatoire');
    const d = await this.getDemandeById(id);
    if (['ANNULEE', 'ACK_RECU', 'RESULTAT_DISPONIBLE'].includes(d.statut)) {
      throw new BadRequestException(`Impossible d'annuler une demande ${d.statut}`);
    }
    return this.prisma.eegDemande.update({ where: { id }, data: { statut: 'ANNULEE', motifAnnulation: motif } });
  }

  async planifierRdv(id: string, dto: any, chefId: string) {
    const d = await this.getDemandeById(id);
    if (d.statut !== 'VALIDEE') throw new BadRequestException(`Statut invalide: ${d.statut}`);
  // === BLOC AJOUTÉ : Si créneau fourni par le CHEF, l'utiliser directement ===
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
        demandeId: id,
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

    return this.prisma.eegDemande.update({
      where: { id },
      data: { statut: 'PLANIFIEE', dateRDV: dateRdv },
    });
  }
  // === FIN BLOC AJOUTÉ ===


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
          const occupe = rdvsExistants.some(r => {
            if (!r || !r.salle || !r.heureDebut || !r.dateRdv) return false;
            const rDate = new Date(r.dateRdv).toDateString();
            return rDate === date.toDateString() && r.salle === salle && r.heureDebut === debut;
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

    if (!trouve || !dateChoisie) throw new BadRequestException('Aucun créneau disponible trouvé');

    const heureNum = parseInt(heureDebut.split(':')[0]);
    const fin = `${String(heureNum + 1).padStart(2, '0')}:00`;

    await this.prisma.eegRdv.create({
      data: {
        patientId: d.patientId,
        prescripteurId: d.prescripteurId,
        demandeId: id,
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

    return this.prisma.eegDemande.update({
      where: { id },
      data: { statut: 'PLANIFIEE', dateRDV: dateChoisie },
    });
  }

  async realiserDemande(id: string, techId: string) {
    const d = await this.getDemandeById(id);
    if (!((d.statut === 'CREEE' && d.urgence === 'STAT') || d.statut === 'PLANIFIEE')) {
      throw new BadRequestException(`Statut invalide: ${d.statut}`);
    }
    return this.prisma.eegDemande.update({ where: { id }, data: { statut: 'EN_COURS', dateRealisation: new Date() } });
  }

  async interpreterDemande(id: string, brouillon: any, medecinId: string) {
    const d = await this.getDemandeById(id);
    if (d.statut !== 'EN_COURS') throw new BadRequestException(`Statut invalide: ${d.statut}`);
    const existant = await this.prisma.eegResultat.findUnique({ where: { demandeId: id } });
    if (existant) {
      await this.prisma.eegResultat.update({ where: { demandeId: id }, data: { ...brouillon } });
    } else {
      await this.prisma.eegResultat.create({ data: { demandeId: id, ...brouillon, medecinValidateurId: medecinId } });
    }
    return this.prisma.eegDemande.update({ where: { id }, data: { statut: 'EN_INTERPRETATION' } });
  }

  async validerCR(id: string, chefId: string) {
    const d = await this.getDemandeById(id);
    if (d.statut !== 'EN_INTERPRETATION') throw new BadRequestException(`Statut invalide: ${d.statut}`);
    await this.prisma.eegResultat.update({
      where: { demandeId: id },
      data: { estImmutable: true, dateValidation: new Date() },
    });
    return this.prisma.eegDemande.update({
      where: { id },
      data: { statut: 'RESULTAT_DISPONIBLE', dateValidation: new Date() },
    });
  }

  async accuserReception(id: string, medecinId: string) {
    const d = await this.getDemandeById(id);
    if (d.statut !== 'RESULTAT_DISPONIBLE') throw new BadRequestException(`Statut invalide: ${d.statut}`);
    return this.prisma.eegDemande.update({ where: { id }, data: { statut: 'ACK_RECU', dateAck: new Date() } });
  }

  async creerDemande(data: any, prescripteurId: string) {
    // Get or create patient (supports external patients)
    const patient = await this.patientLookup.getOrCreateExternalPatient(
      data.patientId,
      data.patient, // Optional patient info
    );

    // Envoi de notification simplifié
    this.notificationService.sendNotification({
      type: "DEMANDE_EXAMEN",
      motif: `Nouvelle demande EEG pour patient ${data.patientId}`,
      urgence: data.urgence === "STAT" ? 3 : data.urgence === "URGENTE" ? 2 : 1,
      sourceServiceId: process.env.EEG_SERVICE_ID,
      sourceServiceName: "EEG",
      patientId: patient.id,
      sentAt: new Date().toISOString(),
    }).catch(err => console.error("Erreur notification:", err.message));

    const demande = await this.prisma.eegDemande.create({
      data: {
        patientId: patient.id,
        prescripteurId: prescripteurId,
        typeEEG: data.typeEEG,
        urgence: data.urgence || 'NORMALE',
        motifPrescription: data.motifPrescription || data.renseignements,
        episodeSoinsId: data.episodeSoinsId || data.chuId || 'EXTERNE',
        numeroEEG: `EEG-${Date.now()}`,
      },
      include: { patient: true, prescripteur: true },
    });
    return demande;
  }
}
