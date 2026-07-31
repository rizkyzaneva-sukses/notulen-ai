FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# python3 isn't installed in this stage; skip youtube-dl-exec's preinstall check here —
# the runner stage (where yt-dlp actually runs) has python3 installed below
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# python3: required to run the yt-dlp binary (YouTube audio fallback when no captions)
# ffmpeg: lets yt-dlp remux/merge streams when a plain bestaudio format isn't available
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 ffmpeg && rm -rf /var/lib/apt/lists/*
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./.next/standalone
COPY --from=builder /app/.next/static ./.next/standalone/.next/static
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 80
ENV PORT=80
ENV UPLOAD_DIR=/app/uploads

# default: web; override with npm run worker for worker service
CMD ["sh", "-c", "npx prisma db push --skip-generate && node .next/standalone/server.js"]
