import { Injectable } from '@nestjs/common';
import { UserClientService } from './user-client.service';

export interface UserInfo {
  id: string;
  nom: string | null;
  prenom: string | null;
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

  async getUserInfo(userId: string | null | undefined): Promise<UserInfo | null> {
    if (!userId) return null;
    const user = await this.userClient.getUserById(userId);
    if (!user) return null;
    return { id: user.id, nom: user.name ?? null, prenom: user.firstname ?? null };
  }

  async attachPrescripteurInfo<T extends { prescripteurId?: string | null }>(
    entity: T,
  ): Promise<T & { prescripteur: UserInfo | null }> {
    const prescripteur = await this.getUserInfo(entity.prescripteurId);
    return { ...entity, prescripteur };
  }

  async attachPrescripteurInfoToMany<T extends { prescripteurId?: string | null }>(
    entities: T[],
  ): Promise<(T & { prescripteur: UserInfo | null })[]> {
    return Promise.all(entities.map((entity) => this.attachPrescripteurInfo(entity)));
  }
}
