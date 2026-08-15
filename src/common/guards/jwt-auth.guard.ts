import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { externalServicesConfig } from '../config/external-services.config';

interface SsoServiceEntry {
  serviceId: string;
  roleName: string;
  permissions: string[];
}

interface SsoTokenPayload {
  userId: string;
  name: string;
  firstname: string;
  email: string;
  services: SsoServiceEntry[];
  exp: number;
}

/**
 * Vérifie la signature HS256 du JWT émis par le service d'auth externe
 * (JWT_SECRET, partagé avec ce service) avant de faire confiance à son
 * contenu. Sans cette vérification, un jeton forgé à la main (n'importe
 * quel payload, signature arbitraire) suffisait à s'authentifier avec
 * n'importe quel rôle — y compris CHEF_SERVICE.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Token d'authentification manquant");
    }

    const payload = this.decodeVerifie(token);
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Token invalide');
    }
    if (!payload.exp || payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedException('Token expiré');
    }

    const serviceEntry = payload.services?.[0];
    if (!serviceEntry) {
      throw new ForbiddenException(
        'Aucun service associé à cet utilisateur',
      );
    }

    request.user = {
      id: payload.userId,
      nom: payload.name,
      prenom: payload.firstname,
      email: payload.email,
      serviceId: serviceEntry.serviceId,
      role: serviceEntry.roleName,
      permissions: serviceEntry.permissions ?? [],
    };
    return true;
  }

  // Si JWT_SECRET est configuré, la signature est vérifiée (jwt.verify) —
  // tout token altéré ou forgé est rejeté avant même d'être lu. Sans
  // secret configuré (environnement de dev/test incomplet), on retombe sur
  // un simple décodage pour ne pas bloquer le démarrage, mais c'est signalé
  // bruyamment à chaque requête : ce mode ne doit jamais tourner en prod.
  private decodeVerifie(token: string): SsoTokenPayload | null {
    const secret = externalServicesConfig.jwtSecret;
    if (!secret) {
      this.logger.warn(
        'JWT_SECRET non configuré — signature NON vérifiée (token simplement décodé). ' +
          'Ne jamais déployer ainsi en production.',
      );
      try {
        return jwt.decode(token) as SsoTokenPayload | null;
      } catch {
        return null;
      }
    }
    try {
      return jwt.verify(token, secret) as SsoTokenPayload;
    } catch (error) {
      this.logger.warn(
        `Signature JWT invalide ou expirée : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7);
  }
}
