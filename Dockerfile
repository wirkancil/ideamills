FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ── Install deps ──────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── Build Next.js (standalone output) ────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production runner ─────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Worker (tsx runtime)
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/app/lib ./app/lib
COPY --from=builder /app/tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p storage && chown nextjs:nodejs storage

USER nextjs
EXPOSE 4000
