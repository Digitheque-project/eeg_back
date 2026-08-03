import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/**
 * Jusqu'ici, chaque règle métier ("Rôle autorisé : TECHNICIEN") n'était
 * qu'un commentaire — jamais appliquée : n'importe quel rôle authentifié
 * pouvait appeler n'importe quelle route via un appel API direct (le
 * front ne fait que cacher des boutons). Ce guard applique enfin ces
 * règles, à partir du rôle déjà décodé par JwtAuthGuard (voir
 * app.module.ts : doit être enregistré APRÈS JwtAuthGuard pour que
 * request.user soit déjà peuplé).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequis = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequis || rolesRequis.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;
    if (!role || !rolesRequis.includes(role)) {
      throw new ForbiddenException(
        `Action réservée à : ${rolesRequis.join(', ')}`,
      );
    }
    return true;
  }
}
