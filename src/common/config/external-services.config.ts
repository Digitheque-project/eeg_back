import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

// ─── Point d'entrée UNIQUE pour toute config d'infrastructure externe ──────
// Un seul point d'entrée réseau désormais : la passerelle unique du CHU
// (GATEWAY_URL). Plus aucune URL directe de service tiers codée en dur ni en
// variable d'environnement séparée (Accueil, User, CHU, Prescription,
// Notification, Dossier patient, Upload...) — seul le SUFFIXE de chemin
// (propre à chaque service, cf. registre gateway) reste dans le code.
//
// Aucun id (CHU, service EEG, chef de service) en configuration : pour une
// requête utilisateur, ils viennent du JWT (jwt-auth.guard.ts) ; pour les
// tâches de fond sans utilisateur (cron), ils sont résolus au démarrage par
// NOM dans le registre central (voir resolveIdentity). CHU_ID,
// SSO_EEG_SERVICE_ID et DEFAULT_CHEF_SERVICE_USER_ID restent acceptées comme
// surcharges exceptionnelles.

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

// Identité de ce déploiement (surcharges facultatives, sinon resolveIdentity).
const identity = {
  chuId: process.env.CHU_ID ?? '',
  serviceId: process.env.SSO_EEG_SERVICE_ID ?? '',
  chefUserId: process.env.DEFAULT_CHEF_SERVICE_USER_ID ?? '',
};

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
  get chuId(): string {
    return identity.chuId;
  },
  set chuId(value: string) {
    identity.chuId = value;
  },
  get eegServiceId(): string {
    return identity.serviceId;
  },
  set eegServiceId(value: string) {
    identity.serviceId = value;
  },

  // Toutes les URLs directes ci-dessous passent désormais par la passerelle
  // unique — un seul GATEWAY_URL à configurer, plus aucune URL de service
  // tiers en variable d'environnement séparée.
  chuApiUrl: gatewayPath('services'), // registre service-service (résout un service par id, pas le CHU)
  chuServiceUrl: gatewayPath('chu'), // prises en charge (entreprises partenaires)
  accueilApiUrl: gatewayPath('accueil'),
  userServiceUrl: gatewayPath('users'),
  internalApiKey: readEnv('INTERNAL_API_KEY'),
  prescriptionApiUrl: gatewayPath('prescriptions'),
  // Le registre gateway proxifie ce service sous /notifications (pluriel,
  // paths: ['/notifications', '/socket.io']), pas /notification — son champ
  // `prefix` ('notification', singulier) ne sert qu'à la convention de doc
  // (/notification/api/docs) et NE correspond PAS à son chemin réel. Comme
  // le point d'appel (notification-external.service.ts) ajoute déjà lui-même
  // /notifications, on garde ici l'origine brute de la gateway, sans suffixe.
  notificationServiceUrl: GATEWAY_URL,
  uploadServiceUrl: gatewayPath('upload'),
  dossierPatientApiUrl: gatewayPath('dossier-patient'),

  // Prescripteur de repli quand une prescription externe n'en fournit aucun
  // (id d'un vrai CHEF_SERVICE côté auth-service). Vide tant que les vrais
  // utilisateurs ne sont pas encore créés — voir DemandesService.resolvePrescripteurId.
  get defaultChefServiceUserId(): string {
    return identity.chefUserId;
  },
  set defaultChefServiceUserId(value: string) {
    identity.chefUserId = value;
  },
};

// Nom du service EEG dans le registre central.
const REGISTRY_SERVICE_NAME =
  process.env.REGISTRY_SERVICE_NAME || 'Électroencéphalographie (EEG)';

/**
 * Résout l'identité de ce déploiement par NOM dans le registre central
 * (service EEG, son CHU) et le chef de service par son RÔLE (CHEF_SERVICE)
 * dans ce service. Ne throw jamais : réessaie tant que la passerelle ou le
 * registre se réveillent, puis rafraîchit toutes les 10 minutes.
 */
export async function resolveIdentity(attempt = 1): Promise<void> {
  const headers = { Authorization: `Bearer ${signServiceToken()}` };
  try {
    if (!GATEWAY_URL) throw new Error('GATEWAY_URL manquant');
    if (!process.env.SSO_EEG_SERVICE_ID || !process.env.CHU_ID) {
      const res = await fetch(`${GATEWAY_URL}/services`, { headers, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`GET /services : HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      const list = (Array.isArray(body) ? body : ((body as { services?: unknown[] })?.services ?? [])) as Array<{ id?: string; name?: string; chuId?: string }>;
      const found = list.find((s) => (s?.name ?? '').trim() === REGISTRY_SERVICE_NAME);
      if (!found?.id) throw new Error(`service "${REGISTRY_SERVICE_NAME}" introuvable dans le registre`);
      if (!process.env.SSO_EEG_SERVICE_ID) identity.serviceId = found.id;
      if (!process.env.CHU_ID && found.chuId) identity.chuId = found.chuId;
    }
    if (!process.env.DEFAULT_CHEF_SERVICE_USER_ID) {
      identity.chefUserId = await findChefServiceUserId(identity.serviceId, headers);
    }
    logger.log(`Identité résolue : serviceId=${identity.serviceId}, chuId=${identity.chuId}, chef=${identity.chefUserId || '(aucun)'}`);
  } catch (error) {
    const delay = Math.min(60, 5 * attempt) * 1000;
    logger.warn(`Résolution de l'identité échouée (${(error as Error).message}), nouvel essai dans ${delay / 1000} s`);
    if (attempt < 20) setTimeout(() => void resolveIdentity(attempt + 1), delay).unref();
    return;
  }
  if (attempt === 1) setInterval(() => void resolveIdentity(2), 10 * 60 * 1000).unref();
}

async function findChefServiceUserId(serviceId: string, headers: Record<string, string>): Promise<string> {
  if (!serviceId) return '';
  const rolesRes = await fetch(`${GATEWAY_URL}/roles`, { headers, signal: AbortSignal.timeout(15000) });
  if (!rolesRes.ok) return '';
  const roles = (await rolesRes.json()) as Array<{ id?: string; name?: string; serviceId?: string }>;
  const chef = (Array.isArray(roles) ? roles : []).find(
    (r) => r?.serviceId === serviceId && (r?.name ?? '').toUpperCase() === 'CHEF_SERVICE',
  );
  if (!chef?.id) return '';
  const usrRes = await fetch(
    `${GATEWAY_URL}/user-service-roles?serviceId=${encodeURIComponent(serviceId)}&roleId=${encodeURIComponent(chef.id)}`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!usrRes.ok) return '';
  const list = (await usrRes.json()) as Array<{ user?: { id?: string } }>;
  return (Array.isArray(list) ? list : []).find((a) => a?.user?.id)?.user?.id ?? '';
}

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
