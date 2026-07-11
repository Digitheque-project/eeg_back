import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SsoUser } from '../../common/interfaces/authenticated-request.interface';
import { RoleUtilisateur } from '@prisma/client';

@Controller('eeg/auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Provisionne (à la volée) la fiche locale de l'utilisateur SSO au premier
   * appel, puis la retourne — même logique que promoteToLocal() dans
   * demandes.service.ts pour les prescripteurs externes : l'id local est
   * directement l'id de l'utilisateur côté service d'auth.
   */
  @Get('me')
  async me(@CurrentUser() ssoUser: SsoUser) {
    return this.prisma.utilisateur.upsert({
      where: { id: ssoUser.id },
      update: {
        nom: ssoUser.nom,
        prenom: ssoUser.prenom,
        email: ssoUser.email,
        role: ssoUser.role as RoleUtilisateur,
        actif: true,
      },
      create: {
        id: ssoUser.id,
        nom: ssoUser.nom,
        prenom: ssoUser.prenom,
        email: ssoUser.email,
        role: ssoUser.role as RoleUtilisateur,
        actif: true,
      },
    });
  }
}
