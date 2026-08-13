import { Injectable } from '@nestjs/common';
import { UserClientService, UserServicesDto } from './user-client.service';
import { externalServicesConfig } from '../config/external-services.config';

export interface UserInfo {
  id: string;
  nom: string | null;
  prenom: string | null;
  /**
   * Rôle affiché sur le compte rendu (signataire, prescripteur). Provient du
   * rôle enregistré pour ce service EEG dans user-services (serviceRoles),
   * à défaut du poste occupé (`job`).
   */
  role?: string | null;
  /**
   * Numéro d'inscription à l'Ordre National des Médecins (ONM) —
   * `registration_number_professional_order` côté user-services. Imprimé
   * sous la signature du compte rendu.
   */
  numeroOrdre?: string | null;
  /** Spécialité / poste (`job` côté user-services). */
  specialite?: string | null;
  /** Téléphone professionnel (`phone` côté user-services). */
  telephone?: string | null;
}

/**
 * Résolution d'un utilisateur externe (prescripteur, médecin validateur...)
 * à la volée — remplace l'ancien `include: { prescripteur: true }` Prisma
 * maintenant qu'il n'y a plus de table Utilisateur locale. Miroir de
 * PatientLookupService pour les patients.
 */
@Injectable()
export class UserLookupService {
  constructor(private readonly userClient: UserClientService) {}

  /**
   * Rôle de l'utilisateur pour CE service EEG. user-services expose
   * `serviceRoles: { serviceId, roleId, roleName? }[]` : on cherche d'abord
   * l'entrée du service EEG courant, puis on retombe sur la première entrée,
   * puis sur `job`. Défensif : la forme exacte varie selon les déploiements,
   * une clé manquante ne doit jamais faire échouer la résolution.
   */
  private extraireRole(user: UserServicesDto): string | null {
    const roles = Array.isArray(user.serviceRoles) ? user.serviceRoles : [];
    const eegServiceId = externalServicesConfig.eegServiceId;

    const candidat =
      roles.find(
        (r) =>
          !!eegServiceId &&
          (r as { serviceId?: string }).serviceId === eegServiceId,
      ) ?? roles[0];

    const nomRole =
      (candidat as { roleName?: string; role?: string } | undefined)
        ?.roleName ??
      (candidat as { role?: string } | undefined)?.role ??
      null;

    return nomRole ?? user.job ?? null;
  }

  async getUserInfo(
    userId: string | null | undefined,
  ): Promise<UserInfo | null> {
    if (!userId) return null;
    const user = await this.userClient.getUserById(userId);
    if (!user) return null;
    return {
      id: user.id,
      nom: user.name ?? null,
      prenom: user.firstname ?? null,
      // Champs ajoutés (jamais retirés) : alimentent le compte rendu
      // officiel — signataire (rôle + n° ONM) et coordonnées.
      role: this.extraireRole(user),
      numeroOrdre: user.registration_number_professional_order ?? null,
      specialite: user.job ?? null,
      telephone: user.phone ?? null,
    };
  }

  async attachPrescripteurInfo<T extends { prescripteurId?: string | null }>(
    entity: T,
  ): Promise<T & { prescripteur: UserInfo | null }> {
    const prescripteur = await this.getUserInfo(entity.prescripteurId);
    return { ...entity, prescripteur };
  }

  async attachPrescripteurInfoToMany<
    T extends { prescripteurId?: string | null },
  >(entities: T[]): Promise<(T & { prescripteur: UserInfo | null })[]> {
    return Promise.all(
      entities.map((entity) => this.attachPrescripteurInfo(entity)),
    );
  }
}
