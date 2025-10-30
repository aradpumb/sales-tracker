# 1) Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
# For some npm native deps (generally safe to include)
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build the app
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client now that schema is present
RUN npx prisma generate
# Build the Next.js app (standalone output configured in next.config)
RUN npm run build

# 3) Production runtime (small)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000

# Copy the standalone server and assets
# This layout is produced by "output: standalone"
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Default command runs the standalone server
CMD ["node", "server.js"]
