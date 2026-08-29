import { Request } from 'express';

export interface SsoUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  serviceId?: string;
  /** CHU de l'appelant, extrait de son JWT (services[0].chu.id) — jamais d'une variable d'environnement. */
  chuId?: string;
  role?: string;
  permissions?: string[];
  isServiceAccount?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: SsoUser;
}
