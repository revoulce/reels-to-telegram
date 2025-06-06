# Multi-stage Docker build for production efficiency

FROM node:18-alpine

# Install system dependencies and create app user
RUN apk add --no-cache python3 py3-pip ffmpeg curl && \
    pip3 install --no-cache-dir yt-dlp && \
    addgroup -g 1001 -S nodejs && \
    adduser -S reelsapp -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create and set permissions for logs directory
RUN mkdir -p logs && chown -R reelsapp:nodejs .

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

# Start the app
CMD ["node", "src/server.js"]
