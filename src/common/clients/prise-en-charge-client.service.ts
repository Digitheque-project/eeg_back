import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../utils/error.util';

export interface PriseEnChargeDto {
  id: string;
  companyName: string;
  nif?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  isActive?: boolean;
  chuId?: string;
  [key: string]: any;
}

@Injectable()
export class PriseEnChargeClientService {
  private readonly logger = new Logger(PriseEnChargeClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl =
      process.env.CHU_SERVICE_URL || 'https://chu-service-7bxj.onrender.com';
    this.apiKey = process.env.INTERNAL_API_KEY || '';
  }

  /**
   * Récupère une prise en charge par son ID depuis chu-service.
   * Returns null on error — never throws.
   */
  async getPriseEnCharge(id: string): Promise<PriseEnChargeDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PriseEnChargeDto>(
          `${this.baseUrl}/prise-en-charge/${id}`,
          {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
            },
          },
        ),
      );

      this.logger.log(
        `GET /prise-en-charge/${id} → ${response.data?.companyName ?? '(vide)'}`,
      );
      return response.data ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch prise en charge ${id}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }
}
