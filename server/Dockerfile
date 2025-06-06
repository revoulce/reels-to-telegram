# Multi-stage Docker build for production efficiency

# Stage 1: Build dependencies
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Runtime image
FROM node:18-alpine AS runtime

# Install system dependencies for yt-dlp
RUN apk add --no-cache yt-dlp gallery-dl

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S reelsapp -u 1001

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder --chown=reelsapp:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=reelsapp:nodejs . .

# Create necessary directories
RUN mkdir -p logs temp && \
    chown -R reelsapp:nodejs logs temp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT:-3000}/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Switch to non-root user
USER reelsapp

# Expose port
EXPOSE 3000

# Environment variables (can be overridden)
ENV NODE_ENV=production
ENV PORT=3000

# Start command
CMD ["node", "src/server.js"]
