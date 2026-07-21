import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../utils/error.util';
import { externalServicesConfig } from '../config/external-services.config';

export interface ChuInfoDto {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  responsable?: string;
  [key: string]: any;
}

export interface ServiceInfoDto {
  id: string;
  name: string;
  description?: string;
  type?: string;
  chuId?: string;
  [key: string]: any;
}

@Injectable()
export class ChuClientService {
  private readonly logger = new Logger(ChuClientService.name);
  // Deux registres distincts : chu-service (infos CHU + prise en charge) et
  // service-service (registre des services rattachés à un CHU) — ne pas les
  // confondre, ce sont deux backends séparés malgré des noms proches.
  private readonly chuServiceBaseUrl: string;
  private readonly serviceRegistryBaseUrl: string;
  private readonly chuId: string;
  private readonly serviceId: string;

  constructor(private readonly httpService: HttpService) {
    this.chuServiceBaseUrl = externalServicesConfig.chuServiceUrl;
    this.serviceRegistryBaseUrl = externalServicesConfig.chuApiUrl;
    this.chuId = externalServicesConfig.chuId;
    this.serviceId = externalServicesConfig.eegServiceId;
  }

  /**
   * Get CHU info by id — via chu-service (chu-docs : GET /chu/{id})
   * @param chuId - CHU id, defaults to this service's own CHU_ID
   */
  async getChuInfo(chuId: string = this.chuId): Promise<ChuInfoDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ChuInfoDto>(
          `${this.chuServiceBaseUrl}/chu/${chuId}`,
          {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch CHU ${chuId}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Get service info by id — via service-service (services-docs : GET /services/{id})
   * @param serviceId - Service id, defaults to this service's own EEG_SERVICE_ID
   */
  async getServiceInfo(
    serviceId: string = this.serviceId,
  ): Promise<ServiceInfoDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ServiceInfoDto>(
          `${this.serviceRegistryBaseUrl}/services/${serviceId}`,
          {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch service ${serviceId}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Convenience wrapper: resolve this EEG service's own metadata (name, etc.)
   */
  async getMyServiceInfo(): Promise<ServiceInfoDto | null> {
    return this.getServiceInfo(this.serviceId);
  }
}
