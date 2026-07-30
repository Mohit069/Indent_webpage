# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Dependencies first, so a code-only change does not reinstall node_modules.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# next.config.ts sets output:'standalone', so this produces a self-contained
# server that does not need node_modules at runtime.
#
# The build reads DATABASE_URL only if a page is statically rendered; every page
# here is force-dynamic, so a placeholder is enough to get through the build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN npm run build

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run the app as root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
