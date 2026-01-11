# Sierra DB Query MCP Server - Docker Configuration
# https://github.com/Yaswanth-ampolu/sierra-db-query

FROM node:lts-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:lts-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts

# Copy built files from builder
COPY --from=builder /app/build ./build

# Copy entrypoint script
COPY docker/entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S sierra-mcp -u 1001 -G nodejs

# Change ownership
RUN chown -R sierra-mcp:nodejs /app

USER sierra-mcp

# Expose HTTP port
EXPOSE 7409

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -q --spider http://localhost:7409/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD []
