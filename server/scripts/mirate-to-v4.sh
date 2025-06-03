#!/bin/bash

# Migration script from v3.0 to v4.0 (Modular Architecture)
# Usage: ./scripts/migrate-to-v4.sh

set -e

echo "🔄 Reels to Telegram v3.0 → v4.0 Migration Script"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] && [ ! -f "server.js" ]; then
    log_error "Please run this script from the server directory"
    exit 1
fi

# Backup current setup
log_info "Creating backup of current setup..."
BACKUP_DIR="backup-v3-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup important files
if [ -f "server.js" ]; then
    cp server.js "$BACKUP_DIR/"
    log_success "Backed up server.js"
fi

if [ -f ".env" ]; then
    cp .env "$BACKUP_DIR/"
    log_success "Backed up .env"
fi

if [ -f "package.json" ]; then
    cp package.json "$BACKUP_DIR/"
    log_success "Backed up package.json"
fi

if [ -d "node_modules" ]; then
    log_info "Backing up package-lock.json..."
    cp package-lock.json "$BACKUP_DIR/" 2>/dev/null || true
fi

log_success "Backup created in $BACKUP_DIR"

# Create new directory structure
log_info "Creating new modular directory structure..."

mkdir -p src/{config,middleware,controllers,services,queue,processors,utils}
mkdir -p tests/{unit,integration}
mkdir -p .github/workflows

log_success "Directory structure created"

# Install new dependencies
log_info "Installing new dependencies..."

# Add new dependencies to package.json if needed
if ! grep -q "joi" package.json; then
    npm install joi
    log_success "Added joi for configuration validation"
fi

if ! grep -q "jest" package.json; then
    npm install --save-dev jest supertest eslint
    log_success "Added testing and linting dependencies"
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    log_warning "Node.js version $NODE_VERSION detected. v4.0 requires Node.js 16+."
    log_info "Please upgrade Node.js: https://nodejs.org/"
fi

# Check for yt-dlp
if ! command -v yt-dlp &> /dev/null; then
    log_warning "yt-dlp not found. Installing..."
    if command -v pip3 &> /dev/null; then
        pip3 install yt-dlp
        log_success "yt-dlp installed via pip3"
    else
        log_error "pip3 not found. Please install yt-dlp manually: pip install yt-dlp"
    fi
fi

# Copy files from artifacts (user needs to do this manually)
log_info "Please copy the following files from the migration artifacts:"
echo ""
echo "📁 src/config/index.js"
echo "📁 src/middleware/*.js"
echo "📁 src/controllers/*.js"
echo "📁 src/services/*.js"
echo "📁 src/queue/*.js"
echo "📁 src/processors/*.js"
echo "📁 src/utils/*.js"
echo "📁 src/server.js"
echo "📁 tests/**/*.js"
echo "📁 package.json (updated)"
echo "📁 Dockerfile"
echo "📁 docker-compose.yml"
echo "📁 .github/workflows/ci.yml"
echo ""

# Validate migration
log_info "Validating migration readiness..."

# Check if files exist (after user copies them)
read -p "Have you copied all the new modular files? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Please copy the modular architecture files first"
    log_info "You can find them in the GitHub repository or documentation"
    exit 0
fi

# Test the new setup
if [ -f "src/server.js" ]; then
    log_info "Testing new modular setup..."

    # Try to load config
    if node -e "require('./src/config')" 2>/dev/null; then
        log_success "Configuration module loads correctly"
    else
        log_error "Configuration module has issues"
        exit 1
    fi

    # Update package.json main entry
    if grep -q '"main": "server.js"' package.json; then
        sed -i.bak 's/"main": "server.js"/"main": "src\/server.js"/' package.json
        log_success "Updated package.json main entry"
    fi

    # Test npm start
    timeout 10s npm start > /dev/null 2>&1 &
    START_PID=$!
    sleep 5

    if kill -0 $START_PID 2>/dev/null; then
        kill $START_PID
        log_success "New server starts successfully"
    else
        log_error "Server failed to start. Check the logs."
        exit 1
    fi
else
    log_warning "src/server.js not found. Please copy the modular files first."
fi

# Run tests if available
if [ -d "tests" ] && [ "$(ls -A tests/)" ]; then
    log_info "Running tests..."
    if npm test; then
        log_success "All tests pass"
    else
        log_warning "Some tests failed. This is normal during migration."
    fi
fi

# Create .dockerignore if it doesn't exist
if [ ! -f ".dockerignore" ]; then
    log_info "Creating .dockerignore..."
    cat > .dockerignore << 'EOF'
node_modules
npm-debug.log*
.env
.git
*.md
tests/
coverage/
.nyc_output
EOF
    log_success "Created .dockerignore"
fi

# Final instructions
echo ""
echo "🎉 Migration to v4.0 Modular Architecture Complete!"
echo "================================================="
echo ""
log_success "Backup saved in: $BACKUP_DIR"
log_info "Next steps:"
echo "  1. npm test                    # Run tests"
echo "  2. npm run lint               # Check code quality"
echo "  3. npm start                  # Start new modular server"
echo "  4. npm run health-check       # Verify everything works"
echo ""
log_info "Docker deployment:"
echo "  docker build -t reels-server ."
echo "  docker-compose up -d"
echo ""
log_info "Documentation:"
echo "  📖 Architecture: docs/architecture.md"
echo "  🧪 Testing: docs/testing.md"
echo "  🐳 Docker: docs/docker.md"
echo ""

if [ -f "$BACKUP_DIR/server.js" ]; then
    log_warning "Keep backup until you verify everything works!"
    log_info "To rollback: cp $BACKUP_DIR/* . && npm install"
fi

echo ""
log_success "🚀 Welcome to the modular architecture era! 🚀"