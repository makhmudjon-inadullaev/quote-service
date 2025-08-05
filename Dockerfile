# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install OpenSSL and other required libraries for Prisma
RUN apk add --no-cache libc6-compat openssl openssl-dev
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build the application
FROM base AS builder
# Install OpenSSL and other required libraries for Prisma
RUN apk add --no-cache libc6-compat openssl openssl-dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image
FROM base AS runner
# Install OpenSSL and other required libraries for Prisma
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 quotesvc

# Copy built application
COPY --from=builder --chown=quotesvc:nodejs /app/dist ./dist
COPY --from=builder --chown=quotesvc:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quotesvc:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quotesvc:nodejs /app/prisma ./prisma
COPY --from=builder --chown=quotesvc:nodejs /app/scripts ./scripts

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R quotesvc:nodejs /app/data

# Make startup script executable
RUN chmod +x /app/scripts/start.sh

# Switch to non-root user
USER quotesvc

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application using the startup script
CMD ["/app/scripts/start.sh"]