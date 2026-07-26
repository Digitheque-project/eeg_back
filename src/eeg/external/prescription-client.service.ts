import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../../common/utils/error.util';
import { externalServicesConfig } from '../../common/config/external-services.config';

// ─── Shape réelle retournée par GET /prescriptions/eeg ──────────────
// Contrairement à d'autres domaines de prescription_back (anapath,
// endoscopie, orl...), le modèle Prisma PrescriptionEEG n'a AUCUNE relation
// demandes[] — chaque prescription EEG est un examen unique, à plat.
// Vérifié le 27/07/2026 contre le schema.prisma réel et une réponse GET
// live : la clé `demandes` est absente de chaque enregistrement.
export interface PrescriptionEegRawDto {
  id: string;
  patientId: string;
  prescripteurId: string;
  /** Nom du médecin prescripteur (peut être vide "") */
  nomMedecinPrescripteur?: string;
  // TODO: prescripteurPrenomManuel n'a pas d'équivalent visible dans le
  // payload réel de prescription_back. Vérifier avec l'équipe prescription_back
  // si un champ prenomMedecinPrescripteur ou similaire est prévu.
  /** Numéro d'ordre national du médecin (utile pour identifier un médecin externe) */
  numeroONM?: string;
  urgence?: string;
  alertes?: string;
  renseignements?: string;
  remarques?: string;
  aeActuel?: string;
  agePremiereCrise?: string;
  dpm?: string;
  typeCrise?: string;
  dateDerniereCrise?: string;
  chuId?: string;
  serviceIdSource?: string;
  serviceIdDest?: string;
  createdAt?: string;
  updatedAt?: string;
  statut?: string;
  statutSync?: string | null;
  syncError?: string | null;
  syncedAt?: string | null;
  syncTentatives?: number;
}

// ─── Forme consommée par eeg_back ──────────────────────────────────
// Un objet par prescription EEG reçue (id = prescriptionParentId, le
// modèle étant plat côté prescription_back). Les noms de champs
// ci-dessous sont les noms INTERNES utilisés par demandes.service.ts
// (buildVirtualDemande, promoteToLocal, aUnPrescripteur).
export interface PrescriptionEegDemandeFlat {
  /** ID de la prescription EEG (prescription_back.PrescriptionEEG.id) */
  id: string;
  /** Identique à `id` — conservé pour compatibilité avec demandes.service.ts */
  prescriptionParentId: string;
  patientId: string;
  prescripteurId: string;
  /** Nom du médecin prescripteur (issu de nomMedecinPrescripteur côté raw) */
  prescripteurNomManuel?: string;
  // TODO: prescripteurPrenomManuel n'a pas d'équivalent dans le payload
  // réel de prescription_back. Le champ reste déclaré ici pour compatibilité
  // avec demandes.service.ts (buildVirtualDemande, aUnPrescripteur) mais
  // sera toujours undefined tant que prescription_back ne l'ajoute pas.
  prescripteurPrenomManuel?: string;
  /** Déduit : true si prescripteurId est vide ET nomMedecinPrescripteur renseigné */
  prescripteurExterne?: boolean;
  /** Numéro d'ordre national du médecin prescripteur */
  numeroONM?: string;
  urgence?: 'NORMALE' | 'URGENTE' | 'STAT';
  renseignements?: string;
  alertes?: string;
  remarques?: string;
  /** CHUA ne classe pas les examens EEG par sous-type — toujours 'EEG' */
  typeEEG: string;
  chuId?: string;
  serviceIdSource?: string;
  serviceIdDest?: string;
  createdAt?: string;
}


// ─── Normalisation du champ urgence ──────────────────────────────────
// prescription_back peut envoyer des variantes non conformes à l'enum
// Prisma NiveauUrgence (STAT | URGENTE | NORMALE). On centralise ici
// la conversion pour ne jamais propager une valeur invalide en aval.
const _normLogger = new Logger('normaliserUrgence');

function normaliserUrgence(
  valeur: string | undefined,
): 'STAT' | 'URGENTE' | 'NORMALE' {
  if (!valeur?.trim()) return 'NORMALE';
  const v = valeur.trim().toUpperCase();
  if (v === 'STAT') return 'STAT';
  if (v === 'URGENTE' || v === 'URGENT') return 'URGENTE';
  if (v === 'NORMALE' || v === 'NORMAL') return 'NORMALE';
  _normLogger.warn(
    `Valeur urgence inconnue reçue de prescription_back : "${valeur}" → fallback NORMALE`,
  );
  return 'NORMALE';
}

function flattenPrescriptions(
  raw: PrescriptionEegRawDto[],
): PrescriptionEegDemandeFlat[] {
  return raw.map((rx) => ({
    id: rx.id,
    prescriptionParentId: rx.id,
    patientId: rx.patientId,
    prescripteurId: rx.prescripteurId,
    prescripteurNomManuel: rx.nomMedecinPrescripteur,
    prescripteurPrenomManuel: undefined, // TODO: pas de source dans payload réel
    prescripteurExterne: !rx.prescripteurId && !!rx.nomMedecinPrescripteur,
    numeroONM: rx.numeroONM,
    urgence: normaliserUrgence(rx.urgence),
    renseignements: rx.renseignements,
    alertes: rx.alertes,
    remarques: rx.remarques,
    typeEEG: 'EEG',
    chuId: rx.chuId,
    serviceIdSource: rx.serviceIdSource,
    serviceIdDest: rx.serviceIdDest,
    createdAt: rx.createdAt,
  }));
}

@Injectable()
export class PrescriptionClientService {
  private readonly logger = new Logger(PrescriptionClientService.name);
  private readonly baseUrl: string;
  private readonly chuId: string;
  private readonly serviceId: string;
  private readonly token: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = externalServicesConfig.prescriptionApiUrl;
    this.chuId = externalServicesConfig.chuId;
    this.serviceId = externalServicesConfig.eegServiceId;
    this.token = externalServicesConfig.prescriptionApiToken;
    if (!this.token) {
      this.logger.warn(
        'PRESCRIPTION_API_TOKEN non défini — les appels vers prescription_back échoueront probablement',
      );
    }
  }

  /**
   * Liste les demandes EEG individuelles (aplaties) destinées à ce service.
   * Returns [] on error — never throws.
   */
  async listEegDemandes(
    serviceIdDest: string = this.serviceId,
    chuId: string = this.chuId,
    overrideToken?: string,
  ): Promise<PrescriptionEegDemandeFlat[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PrescriptionEegRawDto[]>(
          `${this.baseUrl}/eeg`,
          {
            params: { serviceIdDest, chuId },
            timeout: 20000,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${overrideToken ?? this.token}`,
            },
          },
        ),
      );

      this.logger.log(
        `GET /prescriptions/eeg → ${response.data?.length ?? 0} prescription(s) parente(s) reçue(s) ` +
          `(serviceIdDest=${serviceIdDest}, chuId=${chuId})`,
      );
      return flattenPrescriptions(response.data ?? []);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) {
        this.logger.warn(
          `prescription_back a rejeté la requête GET /eeg (${status}) — vérifier PRESCRIPTION_API_TOKEN (expiré ou permissions insuffisantes)`,
        );
      }
      this.logger.warn(
        `Failed to list EEG prescriptions: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  /**
   * Trouve une demande EEG individuelle par son ID dans la liste aplatie.
   * Returns null if not found or unreachable.
   */
  async findDemandeEegById(
    id: string,
    overrideToken?: string,
  ): Promise<PrescriptionEegDemandeFlat | null> {
    const demandes = await this.listEegDemandes(
      this.serviceId,
      this.chuId,
      overrideToken,
    );
    return demandes.find((d) => d.id === id) ?? null;
  }

  /**
   * Répercute un changement de statut EEG sur la prescription dans
   * prescription_back (PATCH /eeg/{id}/statut — modèle plat, pas de
   * sous-ressource demandes). `demandeId` vaut toujours `prescriptionId`
   * dans ce domaine ; le paramètre est conservé pour ne pas changer la
   * signature côté demandes.service.ts.
   * Defensive — never throws.
   */
  async updateDemandeStatut(
    prescriptionId: string,
    demandeId: string,
    statut: string,
    motif?: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.baseUrl}/eeg/${prescriptionId}/statut`,
          { statut, ...(motif ? { motif } : {}) },
          {
            timeout: 20000,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.token}`,
            },
          },
        ),
      );
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) {
        this.logger.warn(
          `prescription_back a rejeté la requête PUT statut ${statut} (${status}) — vérifier PRESCRIPTION_API_TOKEN (expiré ou permissions insuffisantes)`,
        );
      }
      this.logger.warn(
        `Failed to sync statut ${statut} for ` +
          `prescription ${prescriptionId}/demande ${demandeId}: ` +
          getErrorMessage(error),
      );
    }
  }
}
