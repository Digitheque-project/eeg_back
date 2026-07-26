import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrait le token brut de l'en-tête Authorization: Bearer ...
 * Retourne undefined si l'en-tête est absent ou mal formé.
 */
export const BearerToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader) return undefined;

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : undefined;
  },
);
