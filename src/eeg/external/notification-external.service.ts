import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NotificationExternalService {
  private readonly logger = new Logger(NotificationExternalService.name);
  private readonly baseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = process.env.NOTIFICATION_SERVICE_URL || 'https://service-notification.onrender.com';
  }

  async sendNotification(dto: any): Promise<any> {
    try {
      this.logger.log(`📤 Envoi notification vers ${this.baseUrl}/notifications`);
      this.logger.log(`📦 Payload: ${JSON.stringify(dto, null, 2)}`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/notifications`, dto, {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      this.logger.log(`✅ Notification envoyée: ${response.data?.id || 'OK'}`);
      this.logger.log(`📨 Réponse: ${JSON.stringify(response.data, null, 2)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`❌ Erreur envoi notification: ${error.message}`);
      if (error.response) {
        this.logger.error(`📡 Statut: ${error.response.status}`);
        this.logger.error(`📡 Données: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return null;
    }
  }
}
