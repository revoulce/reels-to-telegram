# 📡 API Reference v4.0

Complete API documentation for Reels to Telegram Server with JWT authentication, WebSocket support, and enhanced queue system.

## 📋 Contents

- [Authentication](#authentication)
- [Video Queue Management](#video-queue-management)
- [Real-time WebSocket](#real-time-websocket)
- [Monitoring & Statistics](#monitoring--statistics)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)

## 🌐 Base Configuration

### Base URL
```
http://localhost:3000
```

### API Version
- **Current version:** v4.0
- **Backward compatibility:** v3.0+ supported

### Content-Type
```
Content-Type: application/json
```

## 🔐 Authentication

v4.0 introduces JWT-based authentication with API key fallback for backward compatibility.

### JWT Authentication Flow

#### 1. Get JWT Token
```http
POST /api/auth/token
Content-Type: application/json

{
  "apiKey": "your-64-character-api-key"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "1h",
  "type": "Bearer"
}
```

#### 2. Use JWT Token
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 3. Refresh Token (Optional)
```http
POST /api/auth/refresh
Authorization: Bearer YOUR_CURRENT_TOKEN
```

### API Key Authentication (Legacy)
```http
X-API-Key: your-64-character-api-key
```

## 📥 Video Queue Management

### Add Video to Queue

**Endpoint:** `POST /api/download-video`  
**Auth:** Required  
**Rate Limit:** 20 requests/minute

#### Request
```json
{
  "videoUrl": "blob:https://www.instagram.com/...",
  "pageUrl": "https://www.instagram.com/reels/CwXXX/",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Response
```json
{
  "success": true,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Video added to in-memory processing queue",
  "queuePosition": 3,
  "estimatedWaitTime": 90,
  "processing": {
    "mode": "memory",
    "zeroDiskUsage": true,
    "currentMemoryUsage": "45 MB",
    "memoryUtilization": 22
  }
}
```

#### curl Example
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "blob:https://www.instagram.com/abc123",
    "pageUrl": "https://www.instagram.com/reels/abc123/"
  }' \
  http://localhost:3000/api/download-video
```

### Get Job Status

**Endpoint:** `GET /api/job/:jobId`  
**Auth:** Required  
**Rate Limit:** 150 requests/minute

#### Response Examples

**Queued:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "progress": 0,
  "addedAt": "2024-01-01T00:00:00.000Z",
  "processing": {
    "mode": "memory",
    "estimatedSize": 30000000
  }
}
```

**Processing:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing", 
  "progress": 65,
  "progressMessage": "Sending to Telegram...",
  "startedAt": "2024-01-01T00:01:00.000Z",
  "processing": {
    "mode": "memory"
  }
}
```

**Completed:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "success": true,
    "message": "Video processed successfully in memory",
    "processingTime": 45200,
    "metadata": {
      "author": "username",
      "title": "Instagram Video",
      "views": 12500,
      "likes": 450,
      "duration": 30,
      "fileSize": 25600000
    },
    "telegramMessageId": 12345,
    "memoryProcessing": true
  },
  "completedAt": "2024-01-01T00:02:30.000Z"
}
```

**Failed:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": "Video too large: 60 MB > 50 MB",
  "failedAt": "2024-01-01T00:01:45.000Z"
}
```

### Cancel Job

**Endpoint:** `DELETE /api/job/:jobId`  
**Auth:** Required

#### Response
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

## 🔌 Real-time WebSocket

v4.0 introduces WebSocket support for real-time updates, eliminating the need for polling.

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

// Authenticate
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_JWT_TOKEN'
  }));
};
```

### Subscription Events

#### Subscribe to Job Updates
```javascript
ws.send(JSON.stringify({
  type: 'subscribe:job',
  jobId: '550e8400-e29b-41d4-a716-446655440000'
}));
```

#### Subscribe to Queue Statistics
```javascript
ws.send(JSON.stringify({
  type: 'subscribe:queue'
}));
```

#### Subscribe to Memory Statistics
```javascript
ws.send(JSON.stringify({
  type: 'subscribe:memory'
}));
```

### Incoming Messages

#### Job Progress Update
```json
{
  "type": "job:progress",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 65,
  "message": "Sending to Telegram...",
  "timestamp": "2024-01-01T00:01:30.000Z"
}
```

#### Job Completion
```json
{
  "type": "job:finished",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "success": true,
    "processingTime": 45200,
    "telegramMessageId": 12345
  },
  "timestamp": "2024-01-01T00:02:30.000Z"
}
```

#### Queue Statistics Update
```json
{
  "type": "queue:stats",
  "queued": 5,
  "processing": 2,
  "completed": 127,
  "failed": 8,
  "activeWorkers": 2,
  "maxWorkers": 5,
  "memoryUsage": "45 MB",
  "memoryUtilization": 22,
  "timestamp": "2024-01-01T00:02:00.000Z"
}
```

## 📊 Monitoring & Statistics

### Health Check

**Endpoint:** `GET /health`  
**Auth:** Not required

#### Response
```json
{
  "status": "OK",
  "version": "4.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "process": {
      "rss": 157286400,
      "heapUsed": 31457280,
      "rssFormatted": "150 MB",
      "heapUsedFormatted": "30 MB"
    },
    "queue": {
      "used": 47185920,
      "usedFormatted": "45 MB",
      "max": 209715200,
      "maxFormatted": "200 MB",
      "utilization": 22,
      "peak": 78643200,
      "peakFormatted": "75 MB"
    },
    "system": {
      "total": 8589934592,
      "free": 4294967296,
      "totalFormatted": "8 GB",
      "freeFormatted": "4 GB",
      "utilization": 50
    }
  },
  "queue": {
    "queued": 5,
    "processing": 2,
    "completed": 127,
    "failed": 8,
    "maxQueueSize": 50,
    "activeWorkers": 2,
    "maxWorkers": 5
  },
  "features": {
    "memoryProcessing": true,
    "zeroDiskUsage": true,
    "autoCleanup": true,
    "concurrentProcessing": true
  }
}
```

### Queue Statistics

**Endpoint:** `GET /api/queue/stats`  
**Auth:** Required

#### Response
```json
{
  "queued": 5,
  "processing": 2,
  "completed": 127,
  "failed": 8,
  "totalProcessed": 135,
  "activeWorkers": 2,
  "maxWorkers": 5,
  "maxQueueSize": 50,
  "uptime": 3600,
  "throughputPerMinute": 2.1,
  "memoryUsage": 47185920,
  "memoryUsageFormatted": "45 MB",
  "maxMemory": 209715200,
  "maxMemoryFormatted": "200 MB",
  "memoryUtilization": 22,
  "peakMemoryUsage": 78643200,
  "peakMemoryFormatted": "75 MB",
  "config": {
    "maxConcurrentDownloads": 5,
    "maxQueueSize": 50,
    "queueTimeoutMinutes": 10,
    "memoryProcessing": true,
    "maxMemoryPerVideo": "50 MB",
    "maxTotalMemory": "200 MB",
    "autoCleanup": true
  },
  "webSocket": {
    "totalConnections": 3,
    "totalUsers": 2,
    "totalJobSubscriptions": 5,
    "averageSubscriptionsPerClient": 1.67
  },
  "realTimeUpdates": true
}
```

### Job List

**Endpoint:** `GET /api/queue/jobs`  
**Auth:** Required

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Max jobs (max 100) |
| `offset` | number | 0 | Pagination offset |

#### Response
```json
{
  "jobs": [
    {
      "jobId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "processing",
      "progress": 80,
      "addedAt": "2024-01-01T00:00:00.000Z",
      "startedAt": "2024-01-01T00:01:00.000Z",
      "progressMessage": "Sending to Telegram...",
      "processing": {
        "mode": "memory",
        "estimatedSize": 30000000
      }
    }
  ],
  "pagination": {
    "total": 135,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

### Server Statistics

**Endpoint:** `GET /api/stats`  
**Auth:** Required

#### Response
```json
{
  "uptime": 3600,
  "totalProcessed": 135,
  "throughputPerMinute": 2.1,
  "memory": {
    "process": {
      "rss": 157286400,
      "rssFormatted": "150 MB"
    },
    "queue": {
      "current": 47185920,
      "currentFormatted": "45 MB",
      "peak": 78643200,
      "peakFormatted": "75 MB",
      "utilization": 22
    }
  },
  "queue": {
    "queued": 5,
    "processing": 2,
    "completed": 127,
    "failed": 8
  },
  "config": {
    "version": "4.0.0",
    "memoryProcessing": true,
    "maxFileSize": "50 MB",
    "downloadTimeoutSeconds": 60,
    "maxConcurrentDownloads": 5,
    "maxQueueSize": 50
  }
}
```

## ⚡ Rate Limiting

v4.0 implements multi-tier rate limiting with different limits for different endpoint types.

### Rate Limit Headers
All responses include rate limit information:
```http
X-RateLimit-Limit: 150
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

### Rate Limit Tiers

| Tier | Endpoints | Window | Limit |
|------|-----------|--------|--------|
| **General** | All endpoints | 15 minutes | 500 requests |
| **API** | `/api/*` | 1 minute | 150 requests |
| **Download** | `/api/download-video` | 1 minute | 20 requests |

### Rate Limit Exceeded Response
```json
{
  "success": false,
  "error": "API rate limit exceeded",
  "retryAfter": 30
}
```

### Rate Limit Statistics

**Endpoint:** `GET /api/rate-limits`  
**Auth:** Required

```json
{
  "general": {
    "activeClients": 15,
    "totalRequests": 1250,
    "windowMs": 900000,
    "maxRequests": 500
  },
  "api": {
    "activeClients": 8,
    "totalRequests": 340,
    "windowMs": 60000,
    "maxRequests": 150
  },
  "download": {
    "activeClients": 3,
    "totalRequests": 45,
    "windowMs": 60000,
    "maxRequests": 20
  }
}
```

## ❌ Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | OK - Successful request |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Invalid/missing auth |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource not found |
| `429` | Too Many Requests - Rate limited |
| `500` | Internal Server Error - Server error |
| `503` | Service Unavailable - Queue full |
| `507` | Insufficient Storage - Memory limit |

### Error Response Format
```json
{
  "success": false,
  "error": "Detailed error message",
  "retryAfter": 30,
  "memoryInfo": {
    "current": "180 MB",
    "max": "200 MB",
    "utilization": 90
  }
}
```

### Common Errors

#### Authentication Errors
```json
{
  "success": false,
  "error": "Invalid authentication token"
}
```

#### Validation Errors
```json
{
  "success": false,
  "error": "Invalid Instagram URL. Must contain /reels/, /stories/, or /p/ path"
}
```

#### Queue Errors
```json
{
  "success": false,
  "error": "Queue is full (50/50). Please try again later.",
  "retryAfter": 30
}
```

#### Memory Errors
```json
{
  "success": false,
  "error": "Memory limit would be exceeded: 220 MB > 200 MB",
  "memoryInfo": {
    "current": "180 MB",
    "max": "200 MB",
    "utilization": 90
  }
}
```

## 📝 Complete Example

### Full Workflow with JWT
```bash
#!/bin/bash
API_KEY="your-api-key"
BASE_URL="http://localhost:3000"

# 1. Get JWT token
TOKEN_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\": \"$API_KEY\"}" \
  "$BASE_URL/api/auth/token")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token')
echo "JWT Token: $TOKEN"

# 2. Add video to queue
VIDEO_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "blob:https://www.instagram.com/abc123",
    "pageUrl": "https://www.instagram.com/reels/abc123/"
  }' \
  "$BASE_URL/api/download-video")

JOB_ID=$(echo "$VIDEO_RESPONSE" | jq -r '.jobId')
echo "Job ID: $JOB_ID"

# 3. Monitor progress
while true; do
  STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/job/$JOB_ID" | jq -r '.status')
  
  case $STATUS in
    "completed")
      echo "✅ Video sent to Telegram!"
      break
      ;;
    "failed")
      echo "❌ Processing failed!"
      break
      ;;
    *)
      PROGRESS=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/job/$JOB_ID" | jq -r '.progress // 0')
      echo "🔄 Status: $STATUS, Progress: $PROGRESS%"
      sleep 2
      ;;
  esac
done
```

### WebSocket Example
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_JWT_TOKEN'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'connected':
      console.log('✅ WebSocket authenticated');
      // Subscribe to queue updates
      ws.send(JSON.stringify({
        type: 'subscribe:queue'
      }));
      break;
      
    case 'job:progress':
      console.log(`📊 Job ${message.jobId}: ${message.progress}%`);
      break;
      
    case 'job:finished':
      console.log(`✅ Job ${message.jobId} completed!`);
      break;
      
    case 'queue:stats':
      console.log(`📊 Queue: ${message.queued} queued, ${message.processing} processing`);
      break;
  }
};
```

---

## 📚 Related Documentation

- [Queue System Guide](queue-system.md) - Detailed queue architecture
- [WebSocket Protocol](websocket-protocol.md) - WebSocket message format
- [Troubleshooting](troubleshooting.md) - Common issues
- [Main README](../README.md) - Project overview

---

**📡 API v4.0 - Real-time • Secure • Scalable**