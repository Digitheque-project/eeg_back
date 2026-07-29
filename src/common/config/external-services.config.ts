import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

// ─── Point d'entrée UNIQUE pour toute config d'infrastructure externe ──────
// Objectif : le jour où le CHU déploie sur sa propre infra (qui ne dort
// jamais, contrairement à Render/Railway utilisés en dev), la bascule ne doit
// être qu'un changement de variables d'environnement — jamais une modif de
// code. Donc AUCUNE URL ni id d'un service (Accueil, User, CHU, Prescription,
// Notification...) ne doit être codée en dur ailleurs dans le projet : tout
// passe par ce fichier, qui ne fait que lire process.env.
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

function deriveEegServiceId(): string {
  const token = process.env.PRESCRIPTION_API_TOKEN;
  if (token) {
    try {
      const payload = jwt.decode(token) as Record<string, unknown> | null;
      if (payload && typeof payload === 'object' && typeof payload['serviceId'] === 'string') {
        logger.log(
          `eegServiceId déduit du payload PRESCRIPTION_API_TOKEN : ${payload['serviceId']}`,
        );
        return payload['serviceId'];
      }
      logger.warn(
        'PRESCRIPTION_API_TOKEN décodé mais ne contient pas de champ serviceId exploitable — fallback sur SSO_EEG_SERVICE_ID',
      );
    } catch {
      logger.warn(
        'Échec du décodage de PRESCRIPTION_API_TOKEN — fallback sur SSO_EEG_SERVICE_ID',
      );
    }
  }
  const fallback = process.env.SSO_EEG_SERVICE_ID || '';
  if (!fallback) {
    logger.warn(
      'Aucun serviceId disponible : PRESCRIPTION_API_TOKEN ne contient pas de serviceId et SSO_EEG_SERVICE_ID est vide',
    );
  }
  return fallback;
}

export const externalServicesConfig = {
  // Identité de ce CHU / de ce service EEG dans le système multi-CHU
  chuId: readEnv('CHU_ID'),
  eegServiceId: deriveEegServiceId(),

  // Registre des CHU/services (résolution id → infos)
  chuApiUrl: readEnv('CHU_API_URL'),

  // Prises en charge (entreprises partenaires)
  chuServiceUrl: readEnv('CHU_SERVICE_URL'),

  // Source de vérité des patients
  accueilApiUrl: readEnv('ACCUEIL_API_URL'),

  // Résolution des utilisateurs/prescripteurs par id
  userServiceUrl: readEnv('USER_SERVICE_URL'),
  internalApiKey: readEnv('INTERNAL_API_KEY'),

  // Source des prescriptions EEG
  prescriptionApiUrl: readEnv('PRESCRIPTION_API_URL'),
  prescriptionApiToken: process.env.PRESCRIPTION_API_TOKEN ?? '',

  // Hub de notifications partagé
  notificationServiceUrl: readEnv('NOTIFICATION_SERVICE_URL'),

  // Stockage centralisé des fichiers (images de trace EEG)
  uploadServiceUrl: readEnv('UPLOAD_SERVICE_URL'),

  // Dossier patient partagé (antécédents, diagnostics, examens...)
  dossierPatientApiUrl: readEnv('DOSSIER_PATIENT_API_URL'),

  // Prescripteur de repli quand une prescription externe n'en fournit aucun
  // (id d'un vrai CHEF_SERVICE côté auth-service). Vide tant que les vrais
  // utilisateurs ne sont pas encore créés — voir DemandesService.resolvePrescripteurId.
  defaultChefServiceUserId: process.env.DEFAULT_CHEF_SERVICE_USER_ID ?? '',
};
