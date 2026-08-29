import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

// ─── Point d'entrée UNIQUE pour toute config d'infrastructure externe ──────
// Un seul point d'entrée réseau désormais : la passerelle unique du CHU
// (GATEWAY_URL). Plus aucune URL directe de service tiers codée en dur ni en
// variable d'environnement séparée (Accueil, User, CHU, Prescription,
// Notification, Dossier patient, Upload...) — seul le SUFFIXE de chemin
// (propre à chaque service, cf. registre gateway) reste dans le code.
//
// Aucun id de CHU ni de service EEG n'est plus utilisé en variable
// d'environnement pour un appel porté par une requête utilisateur : ces deux
// identités sont dérivées du JWT de l'appelant (voir jwt-auth.guard.ts, qui
// les expose sur req.user.chuId/serviceId).
//
// SSO_EEG_SERVICE_ID / CHU_ID restent des variables ici, mais avec un rôle
// différent : ce ne sont PAS des identités "empruntées" à un tiers pour
// authentifier des appels, ce sont les constantes d'IDENTITÉ PROPRE de ce
// déploiement (qui suis-je dans le registre multi-CHU/multi-service), au
// même titre que PORT — nécessaires uniquement pour la tâche de fond sans
// requête utilisateur (cron de synchronisation), qui n'a structurellement
// aucun JWT d'où les extraire.
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

const GATEWAY_URL = readEnv('GATEWAY_URL').replace(/\/+$/, '');

function gatewayPath(prefix: string): string {
  return GATEWAY_URL ? `${GATEWAY_URL}/${prefix}` : '';
}

export const externalServicesConfig = {
  // Secret HS256 partagé avec le service SSO externe — signe les JWT que
  // JwtAuthGuard vérifie, ET signe le token de service auto-généré
  // ci-dessous (signServiceToken). DOIT être le même secret que celui qui
  // signe réellement les JWT utilisateurs (vérifié en conditions réelles :
  // secret123, partagé avec la gateway et les autres services).
  jwtSecret: readEnv('JWT_SECRET'),

  // Identité propre de ce déploiement — voir commentaire en tête de fichier.
  chuId: readEnv('CHU_ID'),
  eegServiceId: readEnv('SSO_EEG_SERVICE_ID'),

  // Toutes les URLs directes ci-dessous passent désormais par la passerelle
  // unique — un seul GATEWAY_URL à configurer, plus aucune URL de service
  // tiers en variable d'environnement séparée.
  chuApiUrl: gatewayPath('services'), // registre service-service (résout un service par id, pas le CHU)
  chuServiceUrl: gatewayPath('chu'), // prises en charge (entreprises partenaires)
  accueilApiUrl: gatewayPath('accueil'),
  userServiceUrl: gatewayPath('users'),
  internalApiKey: readEnv('INTERNAL_API_KEY'),
  prescriptionApiUrl: gatewayPath('prescriptions'),
  notificationServiceUrl: gatewayPath('notification'),
  uploadServiceUrl: gatewayPath('upload'),
  dossierPatientApiUrl: gatewayPath('dossier-patient'),

  // Prescripteur de repli quand une prescription externe n'en fournit aucun
  // (id d'un vrai CHEF_SERVICE côté auth-service). Vide tant que les vrais
  // utilisateurs ne sont pas encore créés — voir DemandesService.resolvePrescripteurId.
  defaultChefServiceUserId: process.env.DEFAULT_CHEF_SERVICE_USER_ID ?? '',
};

/**
 * Jeton de service auto-signé pour les appels sortants sans requête
 * utilisateur (cron de synchronisation des prescriptions) — remplace un
 * ancien jeton externe statique (PRESCRIPTION_API_TOKEN) qui expirait et
 * devait être renouvelé manuellement. Signé à la volée avec le même secret
 * que celui utilisé pour vérifier les JWT entrants (jwtSecret) : les
 * services tiers (ex. prescription_back) qui font confiance à ce secret
 * acceptent ce jeton comme n'importe quel JWT SSO légitime.
 *
 * Jamais stocké ni mis en cache : régénéré à chaque appel, donc jamais
 * expiré en pratique (courte durée de vie volontaire — 5 min — pour limiter
 * la fenêtre d'utilisation d'un jeton qui fuiterait).
 *
 * Ne throw jamais (cohérent avec le reste de ce fichier) : sans JWT_SECRET
 * configuré, renvoie une chaîne vide plutôt que de faire planter l'appelant
 * — l'appel HTTP échouera proprement (401) au lieu de ne jamais partir.
 */
export function signServiceToken(): string {
  if (!externalServicesConfig.jwtSecret) {
    logger.warn(
      'JWT_SECRET non défini — impossible de signer un jeton de service, les tâches de fond échoueront.',
    );
    return '';
  }
  return jwt.sign(
    {
      userId: 'eeg-service-account',
      name: 'EEG',
      firstname: 'Service',
      email: 'service@eeg.internal',
      services: [
        {
          serviceId: externalServicesConfig.eegServiceId,
          serviceName: 'Électroencéphalographie (EEG)',
          roleName: 'SERVICE',
          permissions: [],
          chu: { id: externalServicesConfig.chuId },
        },
      ],
    },
    externalServicesConfig.jwtSecret,
    { expiresIn: '5m' },
  );
}
