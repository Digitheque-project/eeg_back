import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../utils/error.util';

export interface UserServicesDto {
  id: string;
  name: string;
  firstname?: string;
  job?: string;
  matricule?: string;
  registration_number_professional_order?: string;
  professional_order?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  serviceRoles?: { id: string; serviceId: string; roleId: string }[];
  [key: string]: any;
}

@Injectable()
export class UserClientService {
  private readonly logger = new Logger(UserClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl =
      process.env.USER_SERVICE_URL ||
      'https://user-services-1sm6.onrender.com';
    this.apiKey = process.env.INTERNAL_API_KEY || '';
    if (!this.apiKey) {
      this.logger.warn(
        'INTERNAL_API_KEY non défini — les appels vers user-services échoueront probablement',
      );
    }
  }

  /**
   * Récupère un utilisateur par son ID depuis user-services.
   * Returns null on error — never throws.
   */
  async getUserById(id: string): Promise<UserServicesDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<UserServicesDto>(`${this.baseUrl}/users/${id}`, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
        }),
      );

      this.logger.log(
        `GET /users/${id} → ${response.data?.name ?? '(vide)'} ${response.data?.firstname ?? ''}`.trim(),
      );
      return response.data ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch user ${id} from user-services: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }
}
