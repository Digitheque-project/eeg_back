import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SsoUser } from '../../common/interfaces/authenticated-request.interface';

@Controller('eeg/auth')
export class AuthController {
  /**
   * Retourne l'utilisateur SSO courant tel que décodé par JwtAuthGuard —
   * aucune donnée locale : identité, rôle et permissions viennent
   * uniquement du service auth externe.
   */
  @Get('me')
  me(@CurrentUser() ssoUser: SsoUser) {
    return ssoUser;
  }
}
