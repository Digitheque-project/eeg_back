import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

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
 * Décode (sans vérifier la signature) le JWT émis par le service d'auth
 * externe — le secret HS256 partagé n'est pas accessible à ce projet.
 * À durcir avec jwt.verify() dès que ce secret sera fourni.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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

    const payload = jwt.decode(token) as SsoTokenPayload | null;
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

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7);
  }
}
