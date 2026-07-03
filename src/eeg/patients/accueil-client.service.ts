import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface AccueilPatientDto {
  id: string;
  nom?: string;
  prenom?: string;
  age?: number;
  sexe?: string;
  chuId?: string;
  [key: string]: any;
}

@Injectable()
export class AccueilClientService {
  private readonly logger = new Logger(AccueilClientService.name);
  private readonly baseUrl: string;
  private readonly chuId: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = process.env.ACCUEIL_API_URL || 'https://acceuil-back-production.up.railway.app/accueil';
    this.chuId = process.env.CHU_ID || '72d49761-2a65-446d-b025-15a74cac1ad4';
  }

  /**
   * Get patient by external ID from Accueil service
   * @param externalPatientId - External patient ID
   * @returns Patient data or null if not found/unavailable
   */
  async getPatientByExternalId(externalPatientId: string): Promise<AccueilPatientDto | null> {
    try {
      this.logger.log(`Fetching patient ${externalPatientId} from Accueil`);
      
      const response = await firstValueFrom(
        this.httpService.get<AccueilPatientDto>(
          `${this.baseUrl}/patients/${externalPatientId}`,
          {
            params: { chuId: this.chuId },
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      this.logger.log(`Successfully fetched patient ${externalPatientId} from Accueil`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`Patient ${externalPatientId} not found in Accueil (404)`);
        return null;
      }
      
      this.logger.warn(
        `Failed to fetch patient ${externalPatientId} from Accueil: ${error.message}`,
      );
      return null;
    }
  }
}
