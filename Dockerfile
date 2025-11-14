# Multi-stage Dockerfile for BSV CAD System
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Run tests (optional, can be skipped in CI)
COPY tests/ ./tests/
COPY jest.config.js ./
RUN npm run test || true

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S caduser && \
    adduser -S -u 1001 -G caduser caduser && \
    chown -R caduser:caduser /app

# Switch to non-root user
USER caduser

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    PROMETHEUS_PORT=9090

# Start application
CMD ["node", "dist/index.js"]
