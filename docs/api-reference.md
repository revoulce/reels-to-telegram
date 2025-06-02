# 📡 API Reference v3.0

Справочник API для Reels to Telegram Server с системой очередей (только реально реализованные endpoints).

## 📋 Содержание

- [Обзор API](#обзор-api)
- [Аутентификация](#аутентификация)
- [Управление очередью](#управление-очередью)
- [Мониторинг](#мониторинг)
- [Коды ошибок](#коды-ошибок)

## 🌐 Обзор API

### Base URL
```
http://localhost:3000
```

### Версионирование
- **Текущая версия:** v3.0
- **Поддержка:** v3.0+ поддерживает систему очередей

### Content-Type
```
Content-Type: application/json
```

## 🔐 Аутентификация

Все защищенные endpoints требуют API ключ в заголовке.

### Заголовок аутентификации
```http
X-API-Key: your-64-character-api-key
```

### Получение API ключа
API ключ настраивается в `.env` файле:
```bash
API_KEY=your-super-secret-api-key-min-32-chars
```

## 📥 Управление очередью

### POST /api/download-video

Добавляет видео в очередь обработки.

**URL:** `/api/download-video`  
**Method:** `POST`  
**Auth:** Required

#### Запрос

```json
{
  "videoUrl": "blob:https://www.instagram.com/...",
  "pageUrl": "https://www.instagram.com/reels/CwXXX/",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Ответ

**200 OK:**
```json
{
  "success": true,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Video added to processing queue",
  "queuePosition": 3,
  "estimatedWaitTime": 90
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Invalid Instagram URL"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Queue is full. Please try again later."
}
```

#### Curl пример
```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "blob:https://www.instagram.com/abc123",
    "pageUrl": "https://www.instagram.com/reels/abc123/"
  }' \
  http://localhost:3000/api/download-video
```

---

### GET /api/job/:jobId

Получает статус конкретной задачи.

**URL:** `/api/job/:jobId`  
**Method:** `GET`  
**Auth:** Required

#### Ответ

**200 OK (Queued):**
```json
{
  "status": "queued",
  "progress": 0,
  "addedAt": "2024-01-01T00:00:00.000Z"
}
```

**200 OK (Processing):**
```json
{
  "status": "processing", 
  "progress": 65,
  "progressMessage": "Sending to Telegram...",
  "startedAt": "2024-01-01T00:01:00.000Z"
}
```

**200 OK (Completed):**
```json
{
  "status": "completed",
  "result": {
    "success": true,
    "message": "Video sent to Telegram successfully",
    "processingTime": 45200,
    "metadata": {
      "author": "username",
      "title": "Instagram Video",
      "views": 0,
      "likes": 0,
      "duration": 0
    },
    "telegramMessageId": 12345
  },
  "completedAt": "2024-01-01T00:02:30.000Z"
}
```

**200 OK (Failed):**
```json
{
  "status": "failed",
  "error": "Download timeout - video might be too large",
  "failedAt": "2024-01-01T00:01:45.000Z"
}
```

**404 Not Found:**
```json
{
  "error": "Job not found"
}
```

#### Curl пример
```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/job/550e8400-e29b-41d4-a716-446655440000
```

---

### DELETE /api/job/:jobId

Отменяет задачу (только если в очереди).

**URL:** `/api/job/:jobId`  
**Method:** `DELETE`  
**Auth:** Required

#### Ответ

**200 OK:**
```json
{
  "success": true,
  "message": "Job cancelled"
}
```

**400 Bad Request:**
```json
{
  "error": "Job cannot be cancelled (not in queue or already processing)"
}
```

**404 Not Found:**
```json
{
  "error": "Job not found"
}
```

#### Curl пример
```bash
curl -X DELETE \
  -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/job/550e8400-e29b-41d4-a716-446655440000
```

---

## 📊 Мониторинг

### GET /health

Базовая проверка здоровья сервера (без аутентификации).

**URL:** `/health`  
**Method:** `GET`  
**Auth:** Not required

#### Ответ

**200 OK:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 157286400,
    "heapTotal": 52428800,
    "heapUsed": 31457280,
    "external": 1048576
  }
}
```

#### Curl пример
```bash
curl http://localhost:3000/health
```

---

### GET /api/health

Проверка здоровья с информацией об очереди.

**URL:** `/api/health`  
**Method:** `GET`  
**Auth:** Not required

#### Ответ

**200 OK:**
```json
{
  "status": "OK",
  "version": "3.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Curl пример
```bash
curl http://localhost:3000/api/health
```

---

### GET /api/queue/stats

Статистика очереди.

**URL:** `/api/queue/stats`  
**Method:** `GET`  
**Auth:** Required

#### Ответ

**200 OK:**
```json
{
  "queued": 5,
  "processing": 2,
  "activeWorkers": 2,
  "maxWorkers": 3,
  "completed": 127,
  "failed": 8,
  "maxQueueSize": 50
}
```

#### Curl пример
```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/queue/stats
```

---

### GET /api/queue/jobs

Список задач с пагинацией.

**URL:** `/api/queue/jobs`  
**Method:** `GET`  
**Auth:** Required

#### Query параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `limit` | number | 100 | Максимум задач (макс. 100) |
| `offset` | number | 0 | Смещение для пагинации |

#### Ответ

**200 OK:**
```json
{
  "jobs": [
    {
      "status": "queued",
      "addedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "status": "processing",
      "progress": 80,
      "startedAt": "2024-01-01T00:01:00.000Z",
      "progressMessage": "Sending to Telegram..."
    },
    {
      "status": "completed",
      "completedAt": "2024-01-01T00:01:30.000Z"
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

#### Curl примеры
```bash
# Все задачи (последние 100)
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/api/queue/jobs"

# С лимитом и смещением
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/api/queue/jobs?limit=20&offset=40"
```

---

### GET /api/stats

Общая статистика сервера.

**URL:** `/api/stats`  
**Method:** `GET`  
**Auth:** Required

#### Ответ

**200 OK:**
```json
{
  "uptime": 3600,
  "memory": {
    "rss": 157286400,
    "heapTotal": 52428800,
    "heapUsed": 31457280,
    "external": 1048576
  },
  "tempFiles": 3,
  "queue": {
    "queued": 5,
    "processing": 2,
    "activeWorkers": 2,
    "maxWorkers": 3,
    "completed": 127,
    "failed": 8,
    "maxQueueSize": 50
  },
  "config": {
    "maxFileSize": "50.00 MB",
    "downloadTimeout": "60s",
    "maxConcurrentDownloads": 3,
    "maxQueueSize": 50
  }
}
```

#### Curl пример
```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/stats
```

## ❌ Коды ошибок

### HTTP статус коды

| Код | Описание |
|-----|----------|
| `200` | OK - Успешный запрос |
| `400` | Bad Request - Неверные параметры |
| `401` | Unauthorized - Неверный API ключ |
| `404` | Not Found - Задача не найдена |
| `500` | Internal Server Error - Ошибка сервера |

### Типичные ошибки

**Валидация:**
- `"pageUrl is required"` - Отсутствует URL страницы
- `"Invalid Instagram URL"` - URL не содержит /reels/, /stories/ или /p/

**Очередь:**
- `"Queue is full. Please try again later."` - Очередь переполнена
- `"Job not found"` - Задача не существует или была очищена
- `"Job cannot be cancelled"` - Задача уже обрабатывается

**Обработка:**
- `"Download timeout - video might be too large"` - Превышен лимит времени
- `"Access denied - video might be private"` - Видео недоступно
- `"Video not available or deleted"` - Видео удалено

## 📝 Примеры использования

### Добавление и отслеживание задачи

```bash
#!/bin/bash
API_KEY="your-api-key"
BASE_URL="http://localhost:3000"

# 1. Добавить видео в очередь
response=$(curl -s -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "blob:https://www.instagram.com/abc123",
    "pageUrl": "https://www.instagram.com/reels/abc123/"
  }' \
  "$BASE_URL/api/download-video")

# 2. Получить jobId
job_id=$(echo "$response" | jq -r '.jobId')
echo "Job ID: $job_id"

# 3. Отслеживать прогресс
while true; do
  status=$(curl -s -H "X-API-Key: $API_KEY" \
    "$BASE_URL/api/job/$job_id" | jq -r '.status')
  
  case $status in
    "completed")
      echo "✅ Завершено!"
      break
      ;;
    "failed")
      echo "❌ Ошибка!"
      break
      ;;
    *)
      progress=$(curl -s -H "X-API-Key: $API_KEY" \
        "$BASE_URL/api/job/$job_id" | jq -r '.progress // 0')
      echo "🔄 Статус: $status, Прогресс: $progress%"
      sleep 2
      ;;
  esac
done
```

### Мониторинг очереди

```bash
#!/bin/bash
API_KEY="your-api-key"

# Статистика очереди
curl -s -H "X-API-Key: $API_KEY" \
  http://localhost:3000/api/queue/stats | jq '
{
  "Очередь": .queued,
  "Обрабатывается": .processing, 
  "Воркеры": "\(.activeWorkers)/\(.maxWorkers)",
  "Завершено": .completed,
  "Ошибки": .failed
}'

# Список активных задач
curl -s -H "X-API-Key: $API_KEY" \
  http://localhost:3000/api/queue/jobs?limit=10 | jq '.jobs[]'
```

---

## 📚 Связанные документы

- [Queue System Guide](queue-system.md) - Подробное руководство по очередям
- [Troubleshooting](troubleshooting.md) - Решение проблем
- [Main README](../README.md) - Общая документация

---

**📡 API основан на реальном коде из `server/server.js`**