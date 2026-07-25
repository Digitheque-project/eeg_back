#!/bin/sh

echo "📦 Application des migrations..."
if npx prisma migrate deploy; then
  echo "✅ Migrations appliquées avec succès"
else
  echo "⚠️ Migrations échouées, réinitialisation complète de la base..."
  npx prisma db push --force-reset --accept-data-loss
fi

echo "🚀 Démarrage du serveur..."
exec node dist/src/main
