#!/bin/sh
set -e

echo "🔧 Résolution des migrations échouées..."
npx prisma migrate resolve --rolled-back 20260629170138_init 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20260629212845_add_external_patient_support 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20260715000000_add_nullable_prescripteur_and_snapshot 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20260723162500_sync_schema_current 2>/dev/null || true

echo "📦 Application des migrations..."
npx prisma migrate deploy

echo "🚀 Démarrage du serveur..."
exec node dist/src/main
