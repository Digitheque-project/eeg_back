import { PrismaService } from '../../prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { AccueilClientService } from './accueil-client.service';
import {
  PriseEnChargeClientService,
  PriseEnChargeDto,
} from '../../common/clients/prise-en-charge-client.service';

export interface PatientInfo {
  nom: string | null;
  prenom: string | null;
  age: number | null;
  sexe: string | null;
  /** Adresse du patient (Accueil) — imprimée sur le compte rendu officiel. */
  adresse: string | null;
  /** Téléphone/contact du patient (Accueil) — idem. */
  contact: string | null;
  idDossier: string | null;
  priseEnCharge: PriseEnChargeDto | null;
  source: 'ACCUEIL' | 'FALLBACK';
}

export interface PatientFallback {
  nom?: string;
  prenom?: string;
  age?: number;
  sexe?: string;
  adresse?: string;
  contact?: string;
}

@Injectable()
export class PatientLookupService {
  private readonly logger = new Logger(PatientLookupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accueilClient: AccueilClientService,
    private readonly priseEnChargeClient: PriseEnChargeClientService,
  ) {}

  /**
   * Fetch live patient demographic info from Accueil, falling back to
   * caller-provided data (e.g. from an external prescription DTO) if
   * Accueil is unreachable or the patient isn't found there.
   */
  async getPatientInfo(
    patientId: string,
    fallback?: PatientFallback,
  ): Promise<PatientInfo> {
    const idDossier = await this.getIdDossier(patientId);
    const accueilPatient =
      await this.accueilClient.getPatientByExternalId(patientId);

    if (accueilPatient) {
      let priseEnCharge: PriseEnChargeDto | null = null;
      if (accueilPatient.priseEnChargeId) {
        priseEnCharge = await this.priseEnChargeClient.getPriseEnCharge(
          accueilPatient.priseEnChargeId,
        );
      }
      return {
        nom: accueilPatient.nom || null,
        prenom: accueilPatient.prenom || null,
        age: accueilPatient.age,
        sexe: accueilPatient.sexe,
        // Accueil reste la source de vérité ; si le champ n'existe pas
        // là-bas, on retombe sur ce que l'appelant a pu fournir.
        adresse: accueilPatient.adresse ?? fallback?.adresse ?? null,
        contact: accueilPatient.contact ?? fallback?.contact ?? null,
        idDossier,
        priseEnCharge,
        source: 'ACCUEIL',
      };
    }

    this.logger.warn(
      `Accueil unavailable for patient ${patientId}, using fallback`,
    );
    return {
      nom: fallback?.nom ?? null,
      prenom: fallback?.prenom ?? null,
      age: fallback?.age ?? null,
      sexe: fallback?.sexe ?? null,
      adresse: fallback?.adresse ?? null,
      contact: fallback?.contact ?? null,
      idDossier,
      priseEnCharge: null,
      source: 'FALLBACK',
    };
  }

  /**
   * EEG-local dossier number assigned to an (external) patientId.
   * idDossier has no equivalent in Accueil — it's purely local bookkeeping.
   */
  async getIdDossier(patientId: string): Promise<string | null> {
    const dossier = await this.prisma.eegDossier.findUnique({
      where: { patientId },
    });
    return dossier?.idDossier ?? null;
  }

  async assignIdDossier(patientId: string, idDossier: string): Promise<string> {
    const dossier = await this.prisma.eegDossier.upsert({
      where: { patientId },
      update: { idDossier },
      create: { patientId, idDossier },
    });
    return dossier.idDossier;
  }

  async getPatientCounts(
    patientId: string,
  ): Promise<{ demandes: number; rdvs: number }> {
    const [demandes, rdvs] = await Promise.all([
      this.prisma.eegDemande.count({ where: { patientId } }),
      this.prisma.eegRdv.count({ where: { patientId } }),
    ]);
    return { demandes, rdvs };
  }

  /**
   * Attach a `patient` field to an entity carrying a `patientId`, replacing
   * the old Prisma `include: { patient: true }` pattern now that there is
   * no more local Patient relation.
   *
   * `adresse` / `contact` sont AUSSI exposés à la racine de l'entité (en
   * plus de `patient.*`) : le générateur de compte rendu côté eeg_front les
   * lit à la racine de la demande / du résultat. Une valeur déjà portée par
   * l'entité elle-même n'est jamais écrasée.
   */
  async attachPatientInfo<T extends { patientId: string }>(
    entity: T,
    fallback?: PatientFallback,
  ): Promise<
    T & { patient: PatientInfo; adresse: string | null; contact: string | null }
  > {
    const patient = await this.getPatientInfo(entity.patientId, fallback);
    const brut = entity as Record<string, unknown>;
    return {
      ...entity,
      patient,
      adresse: (brut.adresse as string | null | undefined) ?? patient.adresse,
      contact: (brut.contact as string | null | undefined) ?? patient.contact,
    };
  }

  async attachPatientInfoToMany<T extends { patientId: string }>(
    entities: T[],
  ): Promise<
    (T & {
      patient: PatientInfo;
      adresse: string | null;
      contact: string | null;
    })[]
  > {
    return Promise.all(
      entities.map((entity) => this.attachPatientInfo(entity)),
    );
  }
}
