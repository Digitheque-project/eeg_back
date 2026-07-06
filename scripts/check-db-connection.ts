/**
 * scripts/check-db-connection.ts
 *
 * Utilitaire de vérification manuelle de la connexion à la base de données.
 * Usage : npm run check:db
 *
 * Lit DATABASE_URL exclusivement depuis process.env (chargé via le .env local).
 * Ne contient aucun identifiant de connexion en dur.
 */

import * as dotenv from 'dotenv';
import { Client } from 'pg';

// Charger .env depuis la racine du projet backend
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ Erreur : la variable DATABASE_URL n\'est pas définie.');
  console.error(
    '   Assurez-vous qu\'un fichier .env existe à la racine du projet avec DATABASE_URL=...',
  );
  process.exit(1);
}

// Masquer le mot de passe dans les logs (affiche juste l'hôte et la DB)
function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[URL invalide]';
  }
}

async function checkConnection(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  console.log(`🔌 Tentative de connexion à : ${maskDatabaseUrl(databaseUrl!)}`);

  try {
    await client.connect();
    const result = await client.query<{ now: Date }>('SELECT NOW() AS now');
    const serverTime = result.rows[0]?.now;
    console.log(`✅ Connexion réussie — heure serveur : ${serverTime}`);
    await client.end();
    process.exit(0);
  } catch (error) {
    const err = error as Error;
    console.error(`❌ Échec de connexion : ${err.message}`);
    process.exit(1);
  }
}

checkConnection();
