import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../../common/utils/error.util';

// ─── Shape réelle retournée par GET /prescriptions/eeg ──────────────
// Le endpoint renvoie des prescriptions parents, chacune contenant un
// tableau demandes[] de demandes EEG individuelles.
export interface PrescriptionEegRawDto {
  id: string;
  patientId: string;
  prescripteurId: string;
  prescripteurNomManuel?: string;
  prescripteurPrenomManuel?: string;
  prescripteurExterne?: boolean;
  urgence?: string;
  alertes?: string;
  renseignements?: string;
  remarques?: string;
  chuId?: string;
  serviceIdSource?: string;
  serviceIdDest?: string;
  createdAt?: string;
  demandes: PrescriptionDemandeeRaw[];
}

export interface PrescriptionDemandeeRaw {
  id: string;
  prescriptionId?: string;
  typeEEG: string;
  statut?: string;
  motifRefus?: string;
}

// ─── Forme aplatie consommée par eeg_back ──────────────────────────
// Chaque élément de demandes[] est aplati en un objet portant les champs
// communs de la prescription parente + les champs propres de la demande.
export interface PrescriptionEegDemandeFlat {
  /** ID de la demande individuelle (prescription_back.demandes[].id) */
  id: string;
  /** ID de la prescription parente (prescription_back.prescription.id) */
  prescriptionParentId: string;
  patientId: string;
  prescripteurId: string;
  prescripteurNomManuel?: string;
  prescripteurPrenomManuel?: string;
  prescripteurExterne?: boolean;
  urgence?: 'NORMALE' | 'URGENTE' | 'STAT';
  renseignements?: string;
  alertes?: string;
  remarques?: string;
  typeEEG: 'STANDARD' | 'SOMMEIL' | 'AMBULATOIRE' | 'VIDEO_EEG';
  chuId?: string;
  serviceIdSource?: string;
  serviceIdDest?: string;
  createdAt?: string;
}

function flattenPrescriptions(
  raw: PrescriptionEegRawDto[],
): PrescriptionEegDemandeFlat[] {
  return raw.flatMap((rx) =>
    (rx.demandes ?? []).map((d) => ({
      id: d.id,
      prescriptionParentId: d.prescriptionId ?? rx.id,
      patientId: rx.patientId,
      prescripteurId: rx.prescripteurId,
      prescripteurNomManuel: rx.prescripteurNomManuel,
      prescripteurPrenomManuel: rx.prescripteurPrenomManuel,
      prescripteurExterne: rx.prescripteurExterne,
      urgence: rx.urgence as PrescriptionEegDemandeFlat['urgence'],
      renseignements: rx.renseignements,
      alertes: rx.alertes,
      remarques: rx.remarques,
      typeEEG: d.typeEEG as PrescriptionEegDemandeFlat['typeEEG'],
      chuId: rx.chuId,
      serviceIdSource: rx.serviceIdSource,
      serviceIdDest: rx.serviceIdDest,
      createdAt: rx.createdAt,
    })),
  );
}

@Injectable()
export class PrescriptionClientService {
  private readonly logger = new Logger(PrescriptionClientService.name);
  private readonly baseUrl: string;
  private readonly chuId: string;
  private readonly serviceId: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl =
      process.env.PRESCRIPTION_API_URL ||
      'https://prescriptionback-production.up.railway.app/prescriptions';
    this.chuId = process.env.CHU_ID || '72d49761-2a65-446d-b025-15a74cac1ad4';
    this.serviceId =
      process.env.EEG_SERVICE_ID || '9d965b9f-4737-435f-abe9-73db0d3cf973';
  }

  /**
   * Liste les demandes EEG individuelles (aplaties) destinées à ce service.
   * Returns [] on error — never throws.
   */
  async listEegDemandes(
    serviceIdDest: string = this.serviceId,
    chuId: string = this.chuId,
  ): Promise<PrescriptionEegDemandeFlat[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PrescriptionEegRawDto[]>(
          `${this.baseUrl}/eeg`,
          {
            params: { serviceIdDest, chuId },
            timeout: 20000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      return flattenPrescriptions(response.data ?? []);
    } catch (error) {
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
  ): Promise<PrescriptionEegDemandeFlat | null> {
    const demandes = await this.listEegDemandes();
    return demandes.find((d) => d.id === id) ?? null;
  }

  /**
   * Répercute un changement de statut EEG sur la demande individuelle
   * dans prescription_back. Le endpoint cible identifie la demande par
   * l'id de la prescription parente + l'id de la demande.
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
        this.httpService.put(
          `${this.baseUrl}/eeg/${prescriptionId}/demandes/${demandeId}/statut`,
          { statut, ...(motif ? { motif } : {}) },
          {
            timeout: 20000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync statut ${statut} for ` +
          `prescription ${prescriptionId}/demande ${demandeId}: ` +
          getErrorMessage(error),
      );
    }
  }
}
