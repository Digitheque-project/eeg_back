import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../../common/utils/error.util';

export interface PrescriptionEegDto {
  id: string;
  patientId: string;
  prescripteurId: string;
  urgence?: 'NORMALE' | 'URGENTE' | 'STAT';
  alertes?: string;
  renseignements: string;
  typeEEG: 'STANDARD' | 'SOMMEIL' | 'AMBULATOIRE' | 'VIDEO_EEG';
  remarques?: string;
  chuId?: string;
  serviceIdSource?: string;
  serviceIdDest?: string;
  createdAt?: string;
  [key: string]: unknown;
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
   * List EEG prescriptions destined for this service.
   * Returns [] on error — never throws (same defensive pattern as
   * AccueilClientService/ChuClientService).
   */
  async listEegPrescriptions(
    serviceIdDest: string = this.serviceId,
    chuId: string = this.chuId,
  ): Promise<PrescriptionEegDto[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PrescriptionEegDto[]>(`${this.baseUrl}/eeg`, {
          params: { serviceIdDest, chuId },
          timeout: 20000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      return response.data ?? [];
    } catch (error) {
      this.logger.warn(
        `Failed to list EEG prescriptions: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  /**
   * The Prescription service exposes no GET /:id — find by id within the
   * list destined for this service. Returns null if not found or unreachable.
   */
  async findEegPrescriptionById(
    id: string,
  ): Promise<PrescriptionEegDto | null> {
    const prescriptions = await this.listEegPrescriptions();
    return prescriptions.find((p) => p.id === id) ?? null;
  }

  /**
   * Reflects an EEG-side status change back onto the source prescription so
   * the prescripteur can see it (e.g. the reason a refusal/cancellation was
   * made — stored there as `motifRefus`). Defensive — never throws, since a
   * failed sync must not block the local EEG workflow.
   */
  async updateStatut(
    prescriptionId: string,
    statut: string,
    motif?: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.put(
          `${this.baseUrl}/eeg/${prescriptionId}/statut`,
          { statut, ...(motif ? { motif } : {}) },
          { timeout: 20000, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync statut ${statut} for prescription ${prescriptionId}: ${getErrorMessage(error)}`,
      );
    }
  }
}
