import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import { getErrorMessage } from '../../common/utils/error.util';
import { withBasePath } from '../../common/utils/url.util';
import { externalServicesConfig } from '../../common/config/external-services.config';

export interface AccueilPatientDto {
  id: string;
  nom?: string;
  prenom?: string;
  sexe?: 'MALE' | 'FEMALE';
  dateNaissance?: string;
  cin?: string;
  chuId?: string;
  [key: string]: any;
}

export interface NormalizedPatient {
  id: string;
  nom: string;
  prenom: string;
  age: number | null;
  sexe: 'M' | 'F' | null;
  priseEnChargeId: string | null;
  /**
   * Adresse du patient telle que fournie par Accueil (clé variable selon le
   * déploiement : adresse / address / adresseComplete...). null si absente.
   */
  adresse: string | null;
  /**
   * Coordonnée téléphonique du patient (phone / telephone / contact / tel).
   * null si absente. Nécessaire au compte rendu officiel CHUA.
   */
  contact: string | null;
}

export interface UpdatePatientPayload {
  nom?: string;
  prenom?: string;
  sexe?: 'M' | 'F';
}

@Injectable()
export class AccueilClientService {
  private readonly logger = new Logger(AccueilClientService.name);
  private readonly baseUrl: string;
  private readonly chuId: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = withBasePath(
      externalServicesConfig.accueilApiUrl,
      '/accueil',
    );
    this.chuId = externalServicesConfig.chuId;
  }

  private calculateAge(dateNaissance?: string): number | null {
    if (!dateNaissance) return null;
    const birth = new Date(dateNaissance);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hasHadBirthdayThisYear =
      now.getMonth() > birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    return age;
  }

  /**
   * Première valeur texte non vide parmi une liste de clés candidates du DTO
   * brut Accueil. Le nom exact du champ varie selon les déploiements
   * (adresse / address / adresseComplete, phone / telephone / contact / tel) :
   * on ne veut ni le coder en dur, ni échouer s'il est absent.
   */
  private premiereValeurTexte(
    raw: AccueilPatientDto,
    cles: string[],
  ): string | null {
    for (const cle of cles) {
      const valeur: unknown = raw[cle];
      if (typeof valeur === 'string' && valeur.trim()) return valeur.trim();
      if (typeof valeur === 'number') return String(valeur);
    }
    return null;
  }

  private normalize(raw: AccueilPatientDto): NormalizedPatient {
    return {
      id: raw.id,
      nom: raw.nom ?? '',
      prenom: raw.prenom ?? '',
      age: this.calculateAge(raw.dateNaissance),
      sexe: raw.sexe === 'MALE' ? 'M' : raw.sexe === 'FEMALE' ? 'F' : null,
      priseEnChargeId:
        typeof raw.priseEnChargeId === 'string' ? raw.priseEnChargeId : null,
      // Adresse / contact : demandés par le compte rendu officiel CHUA,
      // jusqu'ici perdus à la normalisation (le front affichait « Néant »).
      adresse: this.premiereValeurTexte(raw, [
        'adresse',
        'address',
        'adresseComplete',
        'adresse_complete',
        'domicile',
      ]),
      contact: this.premiereValeurTexte(raw, [
        'contact',
        'telephone',
        'phone',
        'tel',
        'numeroTelephone',
        'telephone1',
      ]),
    };
  }

  /**
   * Get patient by external ID from Accueil service
   * @param externalPatientId - External patient ID
   * @returns Normalized patient data or null if not found/unavailable
   */
  async getPatientByExternalId(
    externalPatientId: string,
    chuId: string = this.chuId,
  ): Promise<NormalizedPatient | null> {
    try {
      this.logger.log(`Fetching patient ${externalPatientId} from Accueil`);

      const response = await firstValueFrom(
        this.httpService.get<AccueilPatientDto>(
          `${this.baseUrl}/patients/${externalPatientId}`,
          {
            params: { chuId },
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      // Accueil renvoie parfois 200 avec un corps vide pour un id inconnu
      // (au lieu d'un 404) — sans ce garde, normalize() produirait un
      // patient avec un nom/prénom vide au lieu de retomber sur le fallback.
      if (!response.data || !response.data.id) {
        this.logger.warn(
          `Patient ${externalPatientId} : réponse Accueil vide/invalide`,
        );
        return null;
      }

      this.logger.log(
        `Successfully fetched patient ${externalPatientId} from Accueil`,
      );
      return this.normalize(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn(
          `Patient ${externalPatientId} not found in Accueil (404)`,
        );
        return null;
      }

      this.logger.warn(
        `Failed to fetch patient ${externalPatientId} from Accueil: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * List patients for a CHU, optionally filtered client-side by a search term
   */
  async listPatients(
    chuId: string = this.chuId,
    search?: string,
  ): Promise<NormalizedPatient[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<AccueilPatientDto[]>(`${this.baseUrl}/patients`, {
          params: { chuId },
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const patients = (response.data || []).map((p) => this.normalize(p));
      if (!search) return patients;

      const term = search.toLowerCase();
      return patients.filter(
        (p) =>
          p.nom.toLowerCase().includes(term) ||
          p.prenom.toLowerCase().includes(term),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to list patients from Accueil: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  /**
   * Update patient demographic fields via Accueil
   */
  async updatePatient(
    id: string,
    dto: UpdatePatientPayload,
    chuId: string = this.chuId,
  ): Promise<NormalizedPatient | null> {
    try {
      const payload: Record<string, any> = {};
      if (dto.nom !== undefined) payload.nom = dto.nom;
      if (dto.prenom !== undefined) payload.prenom = dto.prenom;
      if (dto.sexe !== undefined)
        payload.sexe = dto.sexe === 'M' ? 'MALE' : 'FEMALE';

      const response = await firstValueFrom(
        this.httpService.patch<AccueilPatientDto>(
          `${this.baseUrl}/patients/${id}`,
          payload,
          {
            params: { chuId },
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      return this.normalize(response.data);
    } catch (error) {
      this.logger.warn(
        `Failed to update patient ${id} in Accueil: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }
}
