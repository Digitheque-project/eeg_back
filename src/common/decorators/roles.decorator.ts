import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restreint une route aux rôles listés. Sans ce décorateur, RolesGuard
 * laisse passer n'importe quel rôle authentifié (comportement actuel de
 * toutes les routes non annotées).
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
