import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { getErrorMessage } from '../../common/utils/error.util';
import { externalServicesConfig } from '../../common/config/external-services.config';

export interface UploadedFileInfo {
  filename: string;
  path: string;
  url: string;
  mimetype: string;
  size: number;
}

/**
 * Client du service de stockage centralisé des fichiers (CHU Upload API).
 * Auth par token de l'utilisateur connecté (forwardé) — ce service accepte
 * le même JWT HS256 que le reste de l'écosystème (vérifié empiriquement),
 * pas besoin de clé de service statique.
 *
 * Contrairement aux autres clients externes (Accueil, CHU...), les erreurs
 * ne sont PAS avalées ici : un échec d'upload/lecture d'image doit remonter
 * clairement au technicien/chef de service plutôt que d'échouer en silence.
 */
@Injectable()
export class UploadClientService {
  private readonly logger = new Logger(UploadClientService.name);
  private readonly baseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = externalServicesConfig.uploadServiceUrl;
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    token?: string,
  ): Promise<UploadedFileInfo> {
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: mimetype });

    try {
      const response = await firstValueFrom(
        this.httpService.post<UploadedFileInfo>(`${this.baseUrl}/files`, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token ?? ''}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Échec upload fichier "${filename}" vers le service upload: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async getFile(
    filename: string,
    token?: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/files/${filename}`, {
          responseType: 'arraybuffer',
          headers: { Authorization: `Bearer ${token ?? ''}` },
        }),
      );
      const contentType = response.headers['content-type'];
      return {
        data: Buffer.from(response.data),
        contentType: typeof contentType === 'string' ? contentType : 'application/octet-stream',
      };
    } catch (error) {
      this.logger.error(
        `Échec récupération fichier "${filename}" depuis le service upload: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
