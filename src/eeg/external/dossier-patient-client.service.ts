import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../../common/utils/error.util';
import { externalServicesConfig } from '../../common/config/external-services.config';

/**
 * Client du service dossier-patient partagé (antécédents, diagnostics,
 * histoires de maladie, examens physiques...). Auth JWT uniquement (pas
 * d'option x-api-key côté ce service) — on transmet le token de
 * l'utilisateur connecté.
 *
 * Défensif comme les autres clients de lecture (AccueilClientService...) :
 * ne throw jamais, retourne `null` sur toute erreur — y compris un 500,
 * observé chez ce service pour un patient sans données existantes sur
 * certains endpoints (bug apparent côté source, pas une raison de casser
 * l'affichage de la fiche EEG).
 */
@Injectable()
export class DossierPatientClientService {
  private readonly logger = new Logger(DossierPatientClientService.name);
  private readonly baseUrl: string;
  private readonly chuId: string;
  private readonly serviceId: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = externalServicesConfig.dossierPatientApiUrl;
    this.chuId = externalServicesConfig.chuId;
    this.serviceId = externalServicesConfig.eegServiceId;
  }

  private async get(
    path: string,
    patientId: string,
    token: string | undefined,
    label: string,
  ): Promise<unknown | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, {
          params: { chuId: this.chuId, serviceId: this.serviceId, patientId },
          timeout: 8000,
          headers: { Authorization: `Bearer ${token ?? ''}` },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.warn(
        `Échec lecture ${label} (patient ${patientId}) depuis dossier-patient: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  getAntecedents(patientId: string, token?: string) {
    return this.get('/antecedents/all/latest', patientId, token, 'antécédents');
  }

  getHistoireMaladie(patientId: string, token?: string) {
    return this.get(
      '/medical-histories/latest',
      patientId,
      token,
      'histoire de la maladie',
    );
  }

  getDiagnostics(patientId: string, token?: string) {
    return this.get('/diagnostics', patientId, token, 'diagnostics');
  }

  getExamenNeurologique(patientId: string, token?: string) {
    return this.get(
      '/physical-examinations/neurologique/latest',
      patientId,
      token,
      'examen neurologique',
    );
  }
}
