import { Request } from 'express';

export interface SsoUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: SsoUser;
}
