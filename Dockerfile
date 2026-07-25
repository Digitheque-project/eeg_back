# ---- Étape 1 : Build ----
FROM node:20-slim AS builder

WORKDIR /app

# Installer les dépendances (sans postinstall — le schema n'existe pas encore)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copier le reste du code
COPY . .

# Générer le client Prisma puis builder le projet
RUN npx prisma generate
RUN npm run build

# ---- Étape 2 : Production ----
FROM node:20-slim

WORKDIR /app

# Installer curl (Debian)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Installer les dépendances de production uniquement (sans lancer les scripts postinstall)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# Copier le code buildé et les migrations depuis l'étape builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Générer le client Prisma pour la production
RUN npx prisma generate

# Copier l'entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001

# Lancer les migrations puis démarrer le serveur
CMD ["/app/entrypoint.sh"]
