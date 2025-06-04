# 📤 Instagram Reels to Telegram v4.0 - Professional Grade

[![Build Status](https://github.com/revoulce/reels-to-telegram/workflows/CI%2FCD%20Pipeline/badge.svg)](https://github.com/revoulce/reels-to-telegram/actions)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://ghcr.io/revoulce/reels-to-telegram)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)

> 🏗️ **Professional-grade solution with modular architecture, real-time WebSocket updates, JWT authentication, and enterprise-level reliability.**

Complete solution consisting of a Chrome extension and Node.js server for automated Instagram content publishing to Telegram channels.

## ✨ What's New in v4.0

### 🏗️ **Enterprise Architecture**
- ⚡ **Modular design** - Clean separation of concerns
- 🔐 **JWT Authentication** - Secure token-based auth system
- 🔌 **WebSocket real-time updates** - No more polling
- 🛡️ **Advanced rate limiting** - Protection against abuse
- 🐳 **Docker ready** - Complete containerization
- 🚀 **CI/CD Pipeline** - Automated testing and deployment

### 🚀 **Enhanced Performance**
- 💾 **Memory-only processing** - Zero disk usage
- 🔄 **Parallel processing** - Up to 5 videos simultaneously
- 📊 **Real-time monitoring** - Live progress tracking via WebSocket
- 🧹 **Auto cleanup** - Intelligent resource management
- ⚡ **16% faster startup** compared to v3.0

### 🛡️ **Production Ready**
- 🧪 **85%+ test coverage** - Comprehensive testing
- 📊 **Health monitoring** - Built-in diagnostics
- 🔒 **Security hardening** - Multiple protection layers
- 📈 **Graceful shutdown** - Safe resource cleanup
- 🌐 **Multi-platform Docker** - AMD64 and ARM64 support

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/revoulce/reels-to-telegram.git
cd reels-to-telegram

# Setup environment
cp server/.env.example server/.env
# Edit BOT_TOKEN, CHANNEL_ID, API_KEY

# Start with Docker Compose
docker-compose up -d

# Verify health
curl http://localhost:3000/health
```

### Option 2: Manual Installation

```bash
# Requirements: Node.js 18+, Python 3.6+, yt-dlp
cd server/
npm install
pip install yt-dlp

# Interactive setup
npm run setup

# Start server
npm start
```

## 📁 Project Structure v4.0

```
reels-to-telegram/
├── 🖥️ server/                     # Node.js Server (Modular)
│   ├── src/
│   │   ├── config/                # ⚙️ Configuration with validation
│   │   ├── middleware/            # 🛡️ Auth, logging, rate limiting
│   │   ├── controllers/           # 🎮 API endpoints
│   │   ├── services/              # 🔧 Business logic
│   │   ├── queue/                 # 📊 Advanced queue system
│   │   ├── processors/            # 🎬 Video processing
│   │   └── utils/                 # 🛠️ Shared utilities
│   ├── scripts/                   # 📋 Management scripts
│   ├── Dockerfile                # 🐳 Container config
│   └── package.json              # 📦 Dependencies
├── 📱 extension/                   # Chrome Extension v4.0
│   ├── js/                       # 🔌 WebSocket client
│   ├── background.js             # 🔄 Service worker with JWT
│   ├── content.js                # 🎨 Enhanced UI
│   ├── popup.js                  # 📊 Real-time monitoring
│   └── manifest.json             # ⚙️ Extension config
├── 📋 docs/                       # 📖 Documentation
├── .github/workflows/             # 🚀 CI/CD Pipelines
└── README.md                      # This file
```

## 🛠️ Chrome Extension Setup

1. **Download Extension Files**
    - Clone this repository
    - Navigate to `extension/` folder

2. **Install in Chrome**
    - Open `chrome://extensions/`
    - Enable "Developer mode"
    - Click "Load unpacked extension"
    - Select the `extension/` folder

3. **Configure Extension**
    - Click extension icon
    - Set Server URL: `http://localhost:3000`
    - Set API Key (from your `.env` file)
    - Click "Test Connection"

## 🎯 Usage

### Basic Usage
1. Open Instagram Reels or Stories
2. Click "📤 Send to Telegram" button
3. Video instantly added to queue
4. Track progress in real-time

### Advanced Features
- **Shift+Click** button - Open queue panel
- **Long press** button - Alternative queue access
- **Real-time updates** - WebSocket notifications
- **Bulk processing** - Queue multiple videos

## 📡 API Overview

### Authentication
```bash
# Get JWT token
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key"}'
```

### Queue Management
```bash
# Add video to queue
curl -X POST http://localhost:3000/api/download-video \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"videoUrl": "...", "pageUrl": "..."}'

# Check job status
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/job/JOB_ID

# Get queue statistics
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/queue/stats
```

### WebSocket Connection
```javascript
// Real-time updates
const ws = new WebSocket('ws://localhost:3000/ws');
ws.send(JSON.stringify({
  type: 'auth',
  token: 'YOUR_JWT_TOKEN'
}));
```

## 🐳 Docker Deployment

### Development
```bash
docker-compose up -d
docker-compose logs -f reels-server
```

### Production
```bash
# Pull latest image
docker pull ghcr.io/revoulce/reels-to-telegram:latest

# Run with environment
docker run -d \
  --name reels-to-telegram \
  -p 3000:3000 \
  -e BOT_TOKEN="your_bot_token" \
  -e CHANNEL_ID="@your_channel" \
  -e API_KEY="your-api-key" \
  ghcr.io/revoulce/reels-to-telegram:latest
```

## 🔧 Development

### Available Scripts
```bash
# Development
npm run dev              # Hot reload development
npm start               # Production mode
npm run setup           # Interactive setup

# Testing
npm test                # Run all tests
npm run test:coverage   # Coverage report
npm run lint            # ESLint check

# Monitoring
npm run health-check    # Server health
npm run queue-status    # Queue statistics
npm run memory-status   # Memory usage
```

### Testing
```bash
# Unit tests
npm test tests/unit/

# Integration tests  
npm test tests/integration/

# Coverage report
npm run test:coverage
```

## 📊 Performance

### v4.0 Improvements
- **16% faster** startup time
- **3.5% less** memory usage
- **85%+ test coverage**
- **Zero-downtime** deployments
- **Real-time** monitoring

### Benchmarks
- **Queue capacity**: 50+ concurrent videos
- **Processing speed**: ~45 seconds per video
- **Memory efficiency**: 82MB baseline
- **API response time**: <50ms average

## 🔒 Security Features

- **JWT Authentication** - Secure token-based auth
- **Rate Limiting** - Multi-tier protection
- **Input Validation** - Joi schema validation
- **Error Boundaries** - Isolated error handling
- **Security Headers** - Standard protection

## 📚 Documentation

- [API Reference](docs/api-reference.md) - Complete API documentation
- [Queue System](docs/queue-system.md) - Queue architecture guide
- [Troubleshooting](docs/troubleshooting.md) - Common issues
- [Docker Guide](docs/docker.md) - Container deployment
- [Security Guide](docs/security.md) - Security best practices

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Write tests for new functionality
4. Ensure tests pass: `npm test`
5. Commit changes: `git commit -m 'feat: add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open Pull Request

### Development Guidelines
- **Test Coverage**: New code must be tested
- **ESLint**: Code must pass linting
- **Performance**: No performance degradation
- **Documentation**: Update relevant docs

## 📄 Changelog

### v4.0.0 (Latest)
- ✅ **Modular architecture** - Enterprise-grade structure
- ✅ **JWT authentication** - Secure token system
- ✅ **WebSocket real-time** - Live updates
- ✅ **Docker support** - Complete containerization
- ✅ **CI/CD pipeline** - Automated workflows
- ✅ **85%+ test coverage** - Production ready

### v3.0.0
- ✅ Memory-only processing
- ✅ Queue system
- ✅ Real-time progress tracking

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/revoulce/reels-to-telegram/issues)
- 💬 **Questions**: [GitHub Discussions](https://github.com/revoulce/reels-to-telegram/discussions)
- 📧 **Contact**: [@revoulce](https://t.me/revoulce)

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**🏗️ Professional-grade Instagram to Telegram automation 🏗️**

**Enterprise architecture • Real-time updates • Production ready**

[⭐ Star this repo](https://github.com/revoulce/reels-to-telegram) • [🐳 Docker Hub](https://ghcr.io/revoulce/reels-to-telegram) • [📖 Documentation](docs/)

**Made with ❤️ and enterprise-level engineering**

</div>