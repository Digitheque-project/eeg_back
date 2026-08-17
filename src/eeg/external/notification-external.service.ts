import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import { getErrorMessage } from '../../common/utils/error.util';
import { externalServicesConfig } from '../../common/config/external-services.config';

@Injectable()
export class NotificationExternalService {
  private readonly logger = new Logger(NotificationExternalService.name);
  private readonly baseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = externalServicesConfig.notificationServiceUrl;
  }

  async sendNotification(dto: any): Promise<any> {
    try {
      const notifyServiceDto = this.mapToNotifyServiceDto(dto);

      this.logger.log(
        `📤 Envoi notification vers ${this.baseUrl}/notifications/service`,
      );
      this.logger.log(`📦 Payload: ${JSON.stringify(notifyServiceDto, null, 2)}`);

      const response = await firstValueFrom(
        this.httpService.post<{ id?: string }>(
          `${this.baseUrl}/notifications/service`,
          notifyServiceDto,
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      this.logger.log(`✅ Notification envoyée: ${response.data?.id || 'OK'}`);
      this.logger.log(`📨 Réponse: ${JSON.stringify(response.data, null, 2)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `❌ Erreur envoi notification: ${getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(`📡 Statut: ${error.response.status}`);
        this.logger.error(
          `📡 Données: ${JSON.stringify(error.response.data, null, 2)}`,
        );
      }
      return null;
    }
  }

  private mapToNotifyServiceDto(dto: any) {
    const typeTitleMap: Record<string, string> = {
      RESULTAT_DISPONIBLE: 'Nouveau résultat EEG disponible',
      RESULTAT_CRITIQUE: 'Résultat EEG CRITIQUE — action requise',
      DEMANDE_CREEE: 'Nouvelle demande EEG',
      DEMANDE_VALIDEE: 'Demande EEG validée',
      DEMANDE_REJETEE: 'Demande EEG rejetée',
    };

    const typeLevelMap: Record<string, string> = {
      STAT: 'urgent',
      URGENTE: 'warning',
    };

    return {
      serviceId: dto.sourceServiceId || externalServicesConfig.eegServiceId,
      title: typeTitleMap[dto.type] || `Notification EEG – ${dto.type || 'info'}`,
      message: dto.motif || '',
      type: typeLevelMap[dto.urgence] || 'info',
      source: 'eeg-back',
      data: {
        type: dto.type,
        urgence: dto.urgence,
        patientId: dto.patientId,
        sourceServiceName: dto.sourceServiceName,
        sentAt: dto.sentAt,
      },
    };
  }
}
