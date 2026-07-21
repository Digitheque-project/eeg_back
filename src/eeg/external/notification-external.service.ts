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
      this.logger.log(
        `📤 Envoi notification vers ${this.baseUrl}/notifications`,
      );
      this.logger.log(`📦 Payload: ${JSON.stringify(dto, null, 2)}`);

      const response = await firstValueFrom(
        this.httpService.post<{ id?: string }>(
          `${this.baseUrl}/notifications`,
          dto,
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
}
