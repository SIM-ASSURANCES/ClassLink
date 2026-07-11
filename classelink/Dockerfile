# syntax=docker/dockerfile:1

# ─── 1. Dépendances ──────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma
# npm ci refuse : le lockfile a été généré sous Windows et n'a pas les entrées
# de dépendances optionnelles propres à Linux (ex. @swc/helpers via les
# binaires natifs @next/swc-linux-*). npm install résout correctement pour la
# plateforme du conteneur sans toucher au lockfile commité.
RUN npm install

# ─── 2. Build ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Variable factice — seule nécessaire pour que `next build` puisse évaluer les
# modules qui lisent DATABASE_URL au chargement ; la vraie valeur est fournie
# au conteneur au démarrage (voir docker-compose.yml).
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"

RUN npm run build

# ─── 3. Image d'exécution ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Filet de sécurité : garantit la présence du client Prisma généré même si le
# traçage de fichiers de Next.js en oubliait une partie.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
