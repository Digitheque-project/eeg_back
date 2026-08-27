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
    // Appel service↔service (token valide signé mais sans service associé) :
    // il n'a par définition aucun rôle. On le laisse passer uniquement sur
    // les LECTURES (GET) nécessaires à l'agrégation (archives, résultats,
    // historique patient). Les demandes de mutation (PATCH/POST/DELETE)
    // restent fermées : un token sans rôle ne peut pas les déclencher, et
    // leurs handlers supposent `user.role` défini.
    if (request.user?.isServiceAccount) {
      if (request.method === 'GET') return true;
      throw new ForbiddenException(
        'Action réservée à un utilisateur avec rôle',
      );
    }

    const role = request.user?.role;
    if (!role || !rolesRequis.includes(role)) {
      throw new ForbiddenException(
        `Action réservée à : ${rolesRequis.join(', ')}`,
      );
    }
    return true;
  }
}
