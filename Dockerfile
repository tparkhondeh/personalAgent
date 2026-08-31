FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/tmp/build.db"
ENV BETTER_AUTH_URL="http://localhost:3000"
ENV BETTER_AUTH_SECRET="build-only-secret-not-used-at-runtime-000000000000"
RUN pnpm db:generate && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV="production"
ENV PORT="3000"
ENV HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data && chmod +x ./docker-entrypoint.sh
USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
