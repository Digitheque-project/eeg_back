# ---- Étape 1 : Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Installer les dépendances
COPY package.json package-lock.json* ./
RUN npm ci

# Copier le reste du code
COPY . .

# Générer le client Prisma puis builder le projet
RUN npx prisma generate
RUN npm run build

# ---- Étape 2 : Production ----
FROM node:20-alpine

WORKDIR /app

# Installer les dépendances de production uniquement
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copier le code buildé et les migrations depuis l'étape builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Générer le client Prisma pour la production
RUN npx prisma generate

# Installer curl pour les health checks
RUN apk add --no-cache curl

EXPOSE 3001

# Lancer les migrations puis démarrer le serveur
CMD sh -c "npx prisma migrate deploy && node dist/src/main"
