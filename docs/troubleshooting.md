# 🔧 Troubleshooting Guide v4.0

Complete troubleshooting guide for the professional-grade Reels to Telegram system with modular architecture, JWT authentication, and WebSocket real-time updates.

## 📋 Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Authentication Issues](#authentication-issues)
- [WebSocket Problems](#websocket-problems)
- [Queue System Issues](#queue-system-issues)
- [Memory Management](#memory-management)
- [Performance Problems](#performance-problems)
- [Extension Issues](#extension-issues)
- [Diagnostic Commands](#diagnostic-commands)

## 🚀 Quick Diagnostics

### Health Check Workflow

```bash
# 1. Basic server health
curl http://localhost:3000/health
# Expected: {"status":"OK","version":"4.0.0"}

# 2. Authentication test
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"your-api-key"}'
# Expected: JWT token response

# 3. WebSocket connection test
wscat -c ws://localhost:3000/ws
# Send: {"type":"auth","token":"YOUR_JWT"}

# 4. Queue system check
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/api/queue/stats
# Expected: Queue statistics

# 5. Memory system check
curl http://localhost:3000/health | jq '.memory'
# Expected: Memory usage details
```

### System Requirements v4.0

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | 18.0+ | 20.0+ |
| **RAM** | 1GB | 2GB+ |
| **CPU** | 2 cores | 4+ cores |
| **Disk** | 2GB | 10GB+ |
| **Python** | 3.6+ | 3.11+ |

## 🔐 Authentication Issues

### JWT Authentication Problems

#### ❌ "Authentication token required"

**Symptoms:**
- 401 errors on API calls
- Extension shows "Not authenticated"
- WebSocket connection fails

**Diagnosis:**
```bash
# Check API key format
echo "API_KEY length: ${#API_KEY}"
# Should be 32+ characters

# Test direct API key auth (legacy)
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/queue/stats

# Test JWT token generation
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"$API_KEY\"}"
```

**Solutions:**

1. **Check API key configuration:**
```bash
# In .env file
API_KEY=your-64-character-minimum-api-key-here

# Regenerate if needed
openssl rand -hex 32
```

2. **Verify JWT service:**
```bash
# Check JWT configuration
grep JWT .env
# JWT_SECRET should be set (defaults to API_KEY)
# JWT_EXPIRY=24h (optional)
```

3. **Clear extension storage:**
```javascript
// In browser console on extension popup
chrome.storage.local.clear();
```

#### ❌ "Invalid authentication token"

**Symptoms:**
- JWT token rejected by server
- "Token has expired" errors
- Frequent re-authentication requests

**Diagnosis:**
```bash
# Decode JWT token (without verification)
echo "YOUR_JWT_TOKEN" | cut -d. -f2 | base64 -d | jq

# Check token expiry
node -e "
const token = 'YOUR_JWT_TOKEN';
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
console.log('Expires:', new Date(payload.exp * 1000));
console.log('Issued:', new Date(payload.iat * 1000));
"
```

**Solutions:**

1. **Refresh token automatically:**
```javascript
// Extension should handle token refresh
if (tokenExpiry - Date.now() < 5 * 60 * 1000) {
    await refreshToken();
}
```

2. **Check server time synchronization:**
```bash
# Server time
date
# Should match client time
```

3. **Verify JWT secret consistency:**
```bash
# Ensure JWT_SECRET is consistent across restarts
grep JWT_SECRET .env
```

## 🔌 WebSocket Problems

### Connection Issues

#### ❌ "WebSocket connection failed"

**Symptoms:**
- Extension falls back to polling
- No real-time updates
- "Real-time updates inactive" in popup

**Diagnosis:**
```bash
# Test WebSocket endpoint
wscat -c ws://localhost:3000/ws
# Should connect successfully

# Check CORS configuration
curl -H "Origin: chrome-extension://abc123" \
     -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     http://localhost:3000/ws

# Verify WebSocket service status
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/websocket/stats
```

**Solutions:**

1. **Enable WebSocket support:**
```bash
# In .env
WEBSOCKET_ENABLED=true
WEBSOCKET_PATH=/ws
```

2. **Fix CORS configuration:**
```javascript
// In server config
cors({
    origin: [
        'https://www.instagram.com',
        'chrome-extension://*'
    ],
    credentials: true
})
```

3. **Check firewall/proxy:**
```bash
# Test direct connection
telnet localhost 3000
# Should connect

# Check if proxy blocks WebSocket
curl -I http://localhost:3000/ws
```

#### ❌ "WebSocket authentication timeout"

**Symptoms:**
- Connection established but immediately drops
- "Authentication timeout" in logs
- Extension shows connection errors

**Diagnosis:**
```bash
# Monitor WebSocket logs
npm run dev | grep WebSocket

# Test authentication flow
wscat -c ws://localhost:3000/ws
# Send: {"type":"auth","token":"VALID_JWT_TOKEN"}
# Expected: {"type":"connected"}
```

**Solutions:**

1. **Check JWT token validity:**
```bash
# Verify token is not expired
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"'$API_KEY'"}'
```

2. **Increase authentication timeout:**
```javascript
// In WebSocketService.js
this.authTimeout = setTimeout(() => {
    // Increase from 5000 to 10000
}, 10000);
```

3. **Verify WebSocket permissions:**
```json
// In extension manifest.json
"host_permissions": [
    "ws://localhost:*/*",
    "wss://localhost:*/*"
]
```

### Subscription Problems

#### ❌ "Missing real-time updates"

**Symptoms:**
- Extension shows old data
- Progress not updating
- Manual refresh needed

**Diagnosis:**
```javascript
// Check subscription status in browser console
chrome.runtime.sendMessage({action: 'getConnectionStatus'}, console.log);

// Verify WebSocket subscriptions
wscat -c ws://localhost:3000/ws
// Send auth, then: {"type":"subscribe:queue"}
```

**Solutions:**

1. **Re-establish subscriptions:**
```javascript
// In extension background.js
if (webSocketClient.isConnected()) {
    webSocketClient.subscribeToQueue();
    activeJobs.forEach(job => {
        webSocketClient.subscribeToJob(job.jobId);
    });
}
```

2. **Check subscription limits:**
```bash
# Monitor subscription count
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/websocket/stats | jq '.totalJobSubscriptions'
```

## 📊 Queue System Issues

### Queue Capacity Problems

#### ❌ "Queue is full"

**Symptoms:**
- HTTP 503 errors when adding videos
- "Queue is full (50/50)" messages
- Extension shows queue capacity warnings

**Diagnosis:**
```bash
# Check current queue status
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats | jq '{queued,maxQueueSize,processing,maxWorkers}'

# Monitor queue over time
watch -n 5 'curl -s -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats | jq ".queued"'
```

**Solutions:**

1. **Increase queue capacity:**
```bash
# In .env
MAX_QUEUE_SIZE=100  # Increase from 50
```

2. **Add more workers:**
```bash
# In .env
MAX_CONCURRENT_DOWNLOADS=8  # Increase from 5
```

3. **Check for stuck jobs:**
```bash
# List processing jobs
curl -H "Authorization: Bearer $JWT" \
     'http://localhost:3000/api/queue/jobs?limit=10' | \
     jq '.jobs[] | select(.status=="processing")'

# Restart server if jobs are stuck
npm restart
```

#### ❌ "Jobs stuck in processing"

**Symptoms:**
- Jobs stay at processing status
- No progress updates for >10 minutes
- Workers appear busy but no completion

**Diagnosis:**
```bash
# Check job details
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/job/JOB_ID

# Monitor memory usage
curl http://localhost:3000/health | jq '.memory.queue'

# Check system resources
top
ps aux | grep node
```

**Solutions:**

1. **Increase timeouts:**
```bash
# In .env
QUEUE_TIMEOUT=1200000    # 20 minutes
DOWNLOAD_TIMEOUT=120000  # 2 minutes
```

2. **Restart workers gracefully:**
```bash
# Send SIGTERM for graceful shutdown
pkill -TERM node
npm start
```

3. **Check yt-dlp status:**
```bash
# Update yt-dlp
pip install -U yt-dlp

# Test specific URL manually
yt-dlp --dump-json "PROBLEM_URL"
```

## 💾 Memory Management

### Memory Limit Issues

#### ❌ "Memory limit would be exceeded"

**Symptoms:**
- HTTP 507 errors
- Large videos rejected
- Memory utilization warnings

**Diagnosis:**
```bash
# Check memory configuration
grep MEMORY .env

# Monitor memory usage
curl http://localhost:3000/health | jq '.memory'

# Check system memory
free -h
```

**Solutions:**

1. **Increase memory limits:**
```bash
# In .env
MAX_MEMORY_PER_VIDEO=104857600   # 100MB
MAX_TOTAL_MEMORY=524288000       # 500MB
```

2. **Optimize memory usage:**
```bash
# Enable aggressive cleanup
AUTO_MEMORY_CLEANUP=true
MEMORY_WARNING_THRESHOLD=70
```

3. **Check for memory leaks:**
```bash
# Monitor memory over time
watch -n 10 'curl -s http://localhost:3000/health | jq ".memory.process.rssFormatted"'

# Force garbage collection (development)
DEBUG_MEMORY=true
```

#### ❌ "Memory allocation tracking errors"

**Symptoms:**
- Inconsistent memory reporting
- Negative memory values
- Allocation/deallocation mismatches

**Diagnosis:**
```bash
# Enable memory debugging
DEBUG_MEMORY=true npm run dev

# Check allocation consistency
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats | \
     jq '{memoryUsage,activeAllocations,processing}'
```

**Solutions:**

1. **Reset memory tracking:**
```bash
# Restart server to reset tracking
npm restart
```

2. **Verify job cleanup:**
```bash
# Check cleanup intervals
grep CLEANUP .env
# AUTO_CLEANUP_INTERVAL=300000  # 5 minutes
```

## ⚡ Performance Problems

### Slow Processing

#### ❌ "Videos take too long to process"

**Symptoms:**
- Average processing time >2 minutes
- High CPU usage
- System becomes unresponsive

**Diagnosis:**
```bash
# Check performance metrics
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats | \
     jq '{throughputPerMinute,averageProcessingTime}'

# Monitor system resources
iostat 5
htop
```

**Solutions:**

1. **Optimize worker configuration:**
```bash
# In .env
MAX_CONCURRENT_DOWNLOADS=3      # Reduce if CPU bound
WORKER_SPAWN_DELAY=500          # Reduce delay
```

2. **Update dependencies:**
```bash
# Update yt-dlp
pip install -U yt-dlp

# Update Node.js packages
npm update
```

3. **Check network performance:**
```bash
# Test download speed
curl -o /dev/null -w "%{speed_download}\n" https://instagram.com

# Check DNS resolution
nslookup instagram.com
```

### Rate Limiting Issues

#### ❌ "Rate limit exceeded"

**Symptoms:**
- HTTP 429 errors
- Temporary service unavailability
- API calls rejected

**Diagnosis:**
```bash
# Check rate limit status
curl -I -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats

# Monitor rate limit headers
curl -v -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats 2>&1 | grep -i rate
```

**Solutions:**

1. **Increase rate limits:**
```bash
# In .env
RATE_LIMIT_MAX=1000              # Increase general limit
API_RATE_LIMIT_MAX=300           # Increase API limit
DOWNLOAD_RATE_LIMIT_MAX=50       # Increase download limit
```

2. **Implement backoff in extension:**
```javascript
// In background.js
if (error.message.includes('rate limit')) {
    const retryAfter = parseInt(error.retryAfter) || 60;
    setTimeout(() => retry(), retryAfter * 1000);
}
```

## 📱 Extension Issues

### Button Not Appearing

#### ❌ "Send to Telegram button missing"

**Symptoms:**
- No button visible on Instagram
- Extension icon shows inactive
- Content script not loading

**Diagnosis:**
```javascript
// In browser console on Instagram
console.log('Extension active:', !!window.extensionInstance);
console.log('Videos found:', document.querySelectorAll('video').length);
console.log('Current URL:', location.href);
```

**Solutions:**

1. **Check URL patterns:**
```javascript
// Extension only works on specific paths
const validPaths = ['/reels/', '/reel/', '/stories/', '/p/'];
const isValid = validPaths.some(path => location.pathname.includes(path));
```

2. **Reload extension:**
```bash
# In chrome://extensions/
# Click "Reload" button on extension
```

3. **Check permissions:**
```json
// In manifest.json
"host_permissions": [
    "https://www.instagram.com/*"
],
"content_scripts": [{
    "matches": ["https://www.instagram.com/*"]
}]
```

### Real-time Updates Not Working

#### ❌ "Progress not updating in extension"

**Symptoms:**
- Queue panel shows stale data
- Manual refresh needed
- WebSocket indicator red

**Diagnosis:**
```javascript
// Check WebSocket status in extension
chrome.runtime.sendMessage({action: 'getConnectionStatus'}, response => {
    console.log('WebSocket:', response.webSocketConnected);
    console.log('Polling active:', response.pollingActive);
});
```

**Solutions:**

1. **Enable polling fallback:**
```javascript
// Extension should automatically fall back
if (!webSocketConnected) {
    startPollingFallback();
}
```

2. **Check WebSocket permissions:**
```json
// In manifest.json
"content_security_policy": {
    "extension_pages": "script-src 'self'; connect-src 'self' ws://localhost:* wss://localhost:*"
}
```

## 🔍 Diagnostic Commands

### Server Diagnostics

```bash
# Complete health check
npm run health-check

# Queue status with details
npm run queue-status

# Memory utilization
npm run memory-status

# Performance metrics
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/stats | jq

# WebSocket connections
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/websocket/stats

# Rate limiting status
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/rate-limits
```

### Extension Diagnostics

```javascript
// In browser console on Instagram
// Check extension status
console.log('Extension:', window.extensionInstance);

// Check active jobs
chrome.runtime.sendMessage({action: 'getActiveJobs'}, console.log);

// Test server connection
chrome.runtime.sendMessage({action: 'testConnection'}, console.log);

// Check WebSocket status
chrome.runtime.sendMessage({action: 'getConnectionStatus'}, console.log);

// Manual queue refresh
document.getElementById('refreshQueueBtn')?.click();
```

### System Diagnostics

```bash
# Node.js and npm versions
node --version
npm --version

# Python and yt-dlp
python3 --version
yt-dlp --version

# System resources
free -h
df -h
ps aux | grep node

# Network connectivity
ping instagram.com
nslookup www.instagram.com

# Port availability
netstat -tlnp | grep 3000
lsof -i :3000
```

## 🆘 Emergency Procedures

### Complete System Reset

```bash
# 1. Stop all services
pkill -f "node.*server"
pkill -f "yt-dlp"

# 2. Clean temporary files
npm run clean
rm -rf temp/* logs/*

# 3. Reset extension
# Go to chrome://extensions/
# Remove and reinstall extension

# 4. Clear all data
rm -f .env
cp .env.example .env
# Reconfigure all settings

# 5. Fresh start
npm run setup
npm start
```

### Data Recovery

```bash
# Check for stuck jobs
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/jobs | \
     jq '.jobs[] | select(.status=="processing")'

# Export queue data (if needed)
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/jobs?limit=1000 > queue_backup.json

# Memory state export
curl http://localhost:3000/health > health_snapshot.json
```

## 📞 Getting Help

### Information to Collect

When reporting issues, include:

```bash
# 1. System information
node --version
npm --version
python3 --version
yt-dlp --version
uname -a

# 2. Server status
curl http://localhost:3000/health | jq

# 3. Configuration (sanitized)
grep -v TOKEN .env | grep -v KEY

# 4. Recent logs
tail -n 50 logs/server.log

# 5. Queue status
curl -H "Authorization: Bearer $JWT" \
     http://localhost:3000/api/queue/stats

# 6. Extension status
# Screenshot of extension popup
# Browser console errors on Instagram page
```

### Support Channels

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/revoulce/reels-to-telegram/issues)
- 💬 **Questions**: [GitHub Discussions](https://github.com/revoulce/reels-to-telegram/discussions)
- 📧 **Contact**: [@revoulce](https://t.me/revoulce)

---

## 📚 Related Documentation

- [API Reference](api-reference.md) - Complete API documentation
- [Queue System](queue-system.md) - Queue architecture details
- [Main README](../README.md) - Project overview
- [Docker Guide](docker.md) - Container deployment

---

**🔧 Most issues are resolved by restarting the server (`npm restart`) and reloading the extension!**

**🏗️ v4.0 - Professional troubleshooting for enterprise-grade reliability**