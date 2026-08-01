#!/bin/sh

echo "📦 Application des migrations..."
if npx prisma migrate deploy; then
  echo "✅ Migrations appliquées avec succès"
else
  # NE JAMAIS reset la base ici : un reset silencieux efface toutes les
  # données réelles (demandes, statuts, résultats, notifications...) à
  # chaque échec de migration — et Render redémarre le conteneur (donc
  # relance ce script) après chaque période d'inactivité, ce qui rendait
  # ce reset bien plus fréquent qu'un simple imprévu de déploiement.
  # On préfère faire échouer le déploiement : Render garde alors la
  # dernière version qui fonctionnait, et le vrai problème de migration
  # apparaît clairement dans les logs au lieu d'être masqué.
  echo "❌ Échec des migrations — arrêt du déploiement (aucune donnée n'est réinitialisée)."
  echo "   Voir les logs ci-dessus pour la cause exacte ; corriger la migration puis redéployer."
  exit 1
fi

echo "🚀 Démarrage du serveur..."
exec node dist/src/main
