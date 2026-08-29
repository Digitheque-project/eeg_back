import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

// ─── Point d'entrée UNIQUE pour toute config d'infrastructure externe ──────
// Un seul point d'entrée réseau désormais : la passerelle unique du CHU
// (GATEWAY_URL). Plus aucune URL directe de service tiers codée en dur ni en
// variable d'environnement séparée (Accueil, User, CHU, Prescription,
// Notification, Dossier patient, Upload...) — seul le SUFFIXE de chemin
// (propre à chaque service, cf. registre gateway) reste dans le code.
//
// De même, aucun id de CHU ni de service EEG n'est plus codé en variable
// d'environnement : ces deux identités sont dérivées du JWT de l'appelant
// (voir jwt-auth.guard.ts, qui les expose sur req.user.chuId/serviceId) pour
// tout appel porté par une requête utilisateur. Les tâches de fond (cron,
// sans requête utilisateur) restent une exception documentée : elles dérivent
// la même info du PRESCRIPTION_API_TOKEN (dernier repli, service-service).
//
// Une valeur manquante n'empêche pas le démarrage (les clients HTTP sont déjà
// tous défensifs — try/catch, ne throw jamais) mais est signalée bruyamment
// au boot pour qu'une variable oubliée soit visible immédiatement.

const logger = new Logger('ExternalServicesConfig');

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.warn(
      `${name} non défini — les appels vers ce service échoueront tant que ` +
        "cette variable n'est pas configurée.",
    );
  }
  return value ?? '';
}

function decodeServiceTokenField(field: 'serviceId' | 'chuId'): string {
  const token = process.env.PRESCRIPTION_API_TOKEN;
  if (!token) return '';
  try {
    const payload = jwt.decode(token) as Record<string, any> | null;
    const entry = payload?.services?.[0];
    const value = field === 'chuId' ? entry?.chu?.id : entry?.serviceId;
    if (typeof value === 'string' && value) return value;
  } catch {
    /* ignore — repli sur '' ci-dessous */
  }
  return '';
}

// Repli UNIQUEMENT pour les tâches de fond sans requête utilisateur (cron de
// synchronisation) : déduit du même PRESCRIPTION_API_TOKEN déjà nécessaire
// pour authentifier ces appels service-service. Pour tout appel porté par une
// requête utilisateur, préférer req.user.serviceId / req.user.chuId (JWT de
// l'appelant), toujours plus à jour qu'un token statique.
function deriveEegServiceId(): string {
  const value = decodeServiceTokenField('serviceId');
  if (!value) {
    logger.warn(
      'Impossible de déduire eegServiceId de PRESCRIPTION_API_TOKEN — les tâches de fond seront dégradées.',
    );
  } else {
    logger.log(`eegServiceId (repli tâches de fond) déduit de PRESCRIPTION_API_TOKEN : ${value}`);
  }
  return value;
}

function deriveChuId(): string {
  const value = decodeServiceTokenField('chuId');
  if (!value) {
    logger.warn(
      'Impossible de déduire chuId de PRESCRIPTION_API_TOKEN — les tâches de fond seront dégradées.',
    );
  }
  return value;
}

const GATEWAY_URL = readEnv('GATEWAY_URL').replace(/\/+$/, '');

function gatewayPath(prefix: string): string {
  return GATEWAY_URL ? `${GATEWAY_URL}/${prefix}` : '';
}

export const externalServicesConfig = {
  // Secret HS256 partagé avec le service SSO externe — signe les JWT que
  // JwtAuthGuard vérifie. Sans cette variable, le guard ne peut PAS
  // vérifier la signature des tokens (voir jwt-auth.guard.ts).
  jwtSecret: readEnv('JWT_SECRET'),

  // Repli tâches de fond UNIQUEMENT (cron) — voir commentaire ci-dessus.
  // Un appel porté par une requête utilisateur doit utiliser
  // req.user.chuId / req.user.serviceId, jamais ces valeurs.
  chuId: deriveChuId(),
  eegServiceId: deriveEegServiceId(),

  // Toutes les URLs directes ci-dessous passent désormais par la passerelle
  // unique — un seul GATEWAY_URL à configurer, plus aucune URL de service
  // tiers en variable d'environnement séparée.
  chuApiUrl: gatewayPath('services'), // registre service-service (résout un service par id, pas le CHU)
  chuServiceUrl: gatewayPath('chu'), // prises en charge (entreprises partenaires)
  accueilApiUrl: gatewayPath('accueil'),
  userServiceUrl: gatewayPath('users'),
  internalApiKey: readEnv('INTERNAL_API_KEY'),
  prescriptionApiUrl: gatewayPath('prescriptions'),
  prescriptionApiToken: process.env.PRESCRIPTION_API_TOKEN ?? '',
  notificationServiceUrl: gatewayPath('notification'),
  uploadServiceUrl: gatewayPath('upload'),
  dossierPatientApiUrl: gatewayPath('dossier-patient'),

  // Prescripteur de repli quand une prescription externe n'en fournit aucun
  // (id d'un vrai CHEF_SERVICE côté auth-service). Vide tant que les vrais
  // utilisateurs ne sont pas encore créés — voir DemandesService.resolvePrescripteurId.
  defaultChefServiceUserId: process.env.DEFAULT_CHEF_SERVICE_USER_ID ?? '',
};
