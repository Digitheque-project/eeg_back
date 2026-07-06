import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
  private readonly baseUrl: string;
  private readonly chuId: string;
  private readonly serviceId: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = process.env.CHU_API_URL || 'https://service-chu-back-production-d6a8.up.railway.app/service-chu';
    this.chuId = process.env.CHU_ID || '72d49761-2a65-446d-b025-15a74cac1ad4';
    this.serviceId = process.env.EEG_SERVICE_ID || '9d965b9f-4737-435f-abe9-73db0d3cf973';
  }

  /**
   * Get CHU info by id
   * @param chuId - CHU id, defaults to this service's own CHU_ID
   */
  async getChuInfo(chuId: string = this.chuId): Promise<ChuInfoDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ChuInfoDto>(`${this.baseUrl}/chu/${chuId}`, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch CHU ${chuId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get service info by id
   * @param serviceId - Service id, defaults to this service's own EEG_SERVICE_ID
   */
  async getServiceInfo(serviceId: string = this.serviceId): Promise<ServiceInfoDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ServiceInfoDto>(`${this.baseUrl}/service/${serviceId}`, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch service ${serviceId}: ${error.message}`);
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
