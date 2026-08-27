import { Request } from 'express';

export interface SsoUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  serviceId?: string;
  role?: string;
  permissions?: string[];
  isServiceAccount?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: SsoUser;
}
