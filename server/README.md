# 🚀 Reels to Telegram Server v3.0 (Advanced Queue System)

Революционный Node.js сервер с **продвинутой системой очередей** для работы с Chrome расширением Instagram Reels to Telegram.

## 🚀 Революционные возможности v3.0

### ⚡ **Продвинутая система очередей:**
- 🔄 **Параллельная обработка** - до 3 видео одновременно (настраивается)
- 📊 **Live-мониторинг** прогресса каждой задачи в реальном времени
- 🎯 **Умное управление очередью** - автоочистка, приоритизация, отмена
- 📈 **Масштабируемость** - легко увеличить количество воркеров

### 🛡️ **Отказоустойчивость и надежность:**
- 🔒 **Изоляция задач** - ошибка одного видео не влияет на другие
- 🔄 **Retry-механизм** с экспоненциальной задержкой
- 🧹 **Автоочистка** завершенных задач и временных файлов
- 📊 **Мониторинг здоровья** системы и очередей

### 🌐 **RESTful API для очередей:**
- 📡 **Полный CRUD** для управления задачами
- 📊 **Статистика в реальном времени** - очередь, воркеры, производительность
- 🔧 **Гибкая настройка** всех параметров очереди
- 📈 **Метрики производительности** и аналитика

### 🤖 **Интеллектуальная обработка:**
- 🎯 **Оптимизация порядка** обработки задач
- 💾 **Эффективное использование памяти** и ресурсов
- ⏱️ **Таймауты и лимиты** для предотвращения зависаний
- 🔍 **Детальное логирование** всех операций очереди

## 🏗️ Архитектура системы очередей

```
┌─────────────────────────────────────────────────────────┐
│                    REQUEST HANDLER                      │
├─────────────────────────────────────────────────────────┤
│  POST /api/download-video → Мгновенное добавление в очередь │
│  GET  /api/job/:id       → Статус конкретной задачи      │
│  DELETE /api/job/:id     → Отмена задачи                 │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│                    VIDEO QUEUE                          │
├─────────────────────────────────────────────────────────┤
│  📥 QUEUED    │  🔄 PROCESSING  │  ✅ COMPLETED         │
│  Task 1       │  Task 4         │  Task 7               │
│  Task 2       │  Task 5         │  Task 8               │
│  Task 3       │  Task 6         │  Task 9               │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│                  WORKER POOL                            │
├─────────────────────────────────────────────────────────┤
│  Worker 1     │  Worker 2       │  Worker 3             │
│  yt-dlp       │  yt-dlp         │  yt-dlp               │
│  + Telegram   │  + Telegram     │  + Telegram           │
└─────────────────────────────────────────────────────────┘
```

## 🗂️ Структура проекта v3.0

```
reels-to-telegram-server-v3/
├── server.js              # Основной сервер с системой очередей
├── video-queue.js         # Класс VideoQueue (встроен в server.js)
├── setup.js               # Скрипт настройки с опциями очередей
├── package.json           # Обновленные зависимости v3.0
├── .env.example           # Конфиг с параметрами очередей
├── cookies.txt            # Cookies для yt-dlp
├── temp/                  # Временные файлы (автоочистка)
├── logs/                  # Логи очередей (планируется)
└── docs/                  # Документация API v3.0
    ├── queue-api.md       # Документация API очередей
    ├── monitoring.md      # Руководство по мониторингу
    └── scaling.md         # Руководство по масштабированию
```

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
# Клонируйте репозиторий
git clone https://github.com/revoulce/reels-to-telegram.git
cd reels-to-telegram/server

# Установите Node.js зависимости
npm install

# Установите yt-dlp
pip install yt-dlp
# или
brew install yt-dlp  # macOS
# или
sudo apt install yt-dlp  # Ubuntu/Debian
```

### 2. Автоматическая настройка с очередями

```bash
npm run setup
```

Скрипт setup v3.0 настроит:
- ✅ Все базовые параметры (как в v2.1)
- ⚡ **Настройки очередей** - количество воркеров, размер очереди
- 📊 **Мониторинг** - включение статистики и логирования
- 🔧 **Оптимизация** - параметры производительности

### 3. Запуск с системой очередей

```bash
# Продакшн режим с очередями
npm start

# Режим разработки с детальными логами очередей
npm run dev

# Мониторинг статуса очереди
npm run queue-status
```

## ⚙️ Конфигурация очередей

### Environment Variables (.env) v3.0

```bash
# Основные настройки (как раньше)
PORT=3000
NODE_ENV=production
BOT_TOKEN=your_bot_token
CHANNEL_ID=@your_channel
API_KEY=your-64-char-api-key

# === НОВЫЕ НАСТРОЙКИ ОЧЕРЕДЕЙ ===

# Параллельная обработка
MAX_CONCURRENT_DOWNLOADS=3    # Максимум одновременных загрузок
MAX_QUEUE_SIZE=50            # Максимум задач в очереди
QUEUE_TIMEOUT=600000         # Таймаут обработки одной задачи (10 мин)

# Производительность
WORKER_SPAWN_DELAY=1000      # Задержка между запуском воркеров (мс)
QUEUE_POLL_INTERVAL=2000     # Интервал проверки очереди (мс)
AUTO_CLEANUP_INTERVAL=300000 # Интервал автоочистки (5 мин)

# Ограничения ресурсов
MAX_MEMORY_USAGE=1024        # Лимит памяти в MB (на воркер)
MAX_CPU_USAGE=80            # Лимит CPU в % (общий)
DISK_SPACE_MIN=1024         # Минимум свободного места в MB

# Мониторинг и логирование
ENABLE_QUEUE_LOGGING=true    # Детальные логи очереди
ENABLE_PERFORMANCE_METRICS=true  # Метрики производительности
LOG_LEVEL=info              # debug | info | warn | error

# Redis для кластера (опционально, для будущих версий)
# REDIS_URL=redis://localhost:6379
# ENABLE_REDIS_QUEUE=false
```

## 📡 API Endpoints v3.0

### Управление очередями

#### 📥 Добавить видео в очередь
```http
POST /api/download-video
Headers: X-API-Key: your-api-key
Content-Type: application/json

{
  "videoUrl": "blob:https://www.instagram.com/...",
  "pageUrl": "https://www.instagram.com/reels/xyz/",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Ответ:**
```json
{
  "success": true,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Video added to processing queue",
  "queuePosition": 3,
  "estimatedWaitTime": 90,
  "priority": "normal"
}
```

#### 📊 Статус конкретной задачи
```http
GET /api/job/:jobId
Headers: X-API-Key: your-api-key
```

**Ответ:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 65,
  "progressMessage": "Sending to Telegram...",
  "addedAt": "2024-01-01T00:00:00.000Z",
  "startedAt": "2024-01-01T00:01:00.000Z",
  "estimatedTimeLeft": 30,
  "workerName": "worker-2",
  "videoData": {
    "pageUrl": "https://www.instagram.com/reels/xyz/",
    "title": "Video title",
    "author": "username"
  }
}
```

#### ❌ Отменить задачу
```http
DELETE /api/job/:jobId
Headers: X-API-Key: your-api-key
```

**Ответ:**
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "wasProcessing": false
}
```

### Мониторинг очередей

#### 📊 Статистика очереди
```http
GET /api/queue/stats
Headers: X-API-Key: your-api-key
```

**Ответ:**
```json
{
  "queued": 5,
  "processing": 2,
  "completed": 127,
  "failed": 8,
  "cancelled": 3,
  "activeWorkers": 2,
  "maxWorkers": 3,
  "maxQueueSize": 50,
  "averageProcessingTime": 45.2,
  "throughputPerHour": 78,
  "memoryUsage": {
    "used": 156,
    "total": 512,
    "percentage": 30
  },
  "config": {
    "maxConcurrentDownloads": 3,
    "maxQueueSize": 50,
    "queueTimeout": 10
  }
}
```

#### 📋 Список всех задач
```http
GET /api/queue/jobs?limit=50&offset=0&status=all
Headers: X-API-Key: your-api-key
```

**Ответ:**
```json
{
  "jobs": [
    {
      "jobId": "...",
      "status": "processing",
      "progress": 80,
      "addedAt": "2024-01-01T00:00:00.000Z",
      "pageUrl": "https://www.instagram.com/reels/xyz/",
      "workerName": "worker-1"
    }
  ],
  "pagination": {
    "total": 135,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### Управление воркерами

#### 🔧 Управление воркерами (НОВОЕ!)
```http
POST /api/workers/scale
Headers: X-API-Key: your-api-key

{
  "workerCount": 5  // Изменить количество воркеров
}
```

#### 🔄 Перезапуск воркеров
```http
POST /api/workers/restart
Headers: X-API-Key: your-api-key
```

#### 📊 Статистика воркеров
```http
GET /api/workers/stats
Headers: X-API-Key: your-api-key
```

### Продвинутая аналитика

#### 📈 Метрики производительности
```http
GET /api/metrics/performance
Headers: X-API-Key: your-api-key
```

**Ответ:**
```json
{
  "lastHour": {
    "completed": 45,
    "failed": 2,
    "averageTime": 42.5,
    "throughput": 45
  },
  "last24Hours": {
    "completed": 1080,
    "failed": 12,
    "averageTime": 38.7,
    "peakHour": "14:00-15:00"
  },
  "systemHealth": {
    "cpuUsage": 45,
    "memoryUsage": 62,
    "diskSpace": 78,
    "status": "healthy"
  }
}
```

## 🔄 Интеграция с расширением v3.0

### Настройки расширения:
- **Server URL:** `http://localhost:3000`
- **API Key:** Из вашего `.env` файла
- **Queue Monitoring:** Автоматически включается

### Процесс работы с очередями:
1. 📱 Пользователь нажимает Send на множестве видео
2. 📥 Расширение **мгновенно** добавляет каждое в очередь
3. 🎯 Получает **jobId** и позицию в очереди
4. 🔄 **Параллельно** до 3 воркеров обрабатывают задачи
5. 📊 Расширение **отслеживает прогресс** каждой задачи
6. 📺 Публикация в Telegram с метаданными об очереди

### Новые возможности для расширения:
- **Live-обновления** статуса через polling
- **Отмена задач** до/во время обработки
- **Приоритетная очередь** для важных видео (планируется)
- **Оффлайн-режим** с синхронизацией (планируется)

## 🛠️ Скрипты v3.0

```bash
# Основные команды
npm start              # Запуск сервера с очередями
npm run dev            # Разработка с детальными логами
npm run setup          # Настройка с опциями очередей

# Управление очередями
npm run queue-status   # Статус очереди
npm run queue-clear    # Очистка очереди (планируется)
npm run queue-pause    # Пауза очереди (планируется)
npm run queue-resume   # Возобновление очереди (планируется)

# Обслуживание
npm run clean          # Очистка временных файлов
npm run health-check   # Проверка здоровья системы
npm run metrics        # Показать метрики производительности

# Диагностика
npm run debug-queue    # Детальная диагностика очереди
npm run worker-stats   # Статистика воркеров
npm run memory-report  # Отчет по использованию памяти
```

## 🧹 Автоматическое обслуживание

### Автоочистка v3.0:
- 🕐 **Каждые 5 минут** удаляются записи о завершенных задачах старше 1 часа
- 🕐 **Каждые 30 минут** удаляются временные файлы старше 1 часа
- 🕐 **Каждый час** сжимаются логи и освобождается память
- 🕐 **Каждые 24 часа** генерируется отчет по производительности

### Мониторинг здоровья:
- 📊 **CPU и память** - автоматическое снижение нагрузки при превышении лимитов
- 💾 **Дисковое пространство** - предупреждения при нехватке места
- 🌐 **Сетевые ошибки** - автоматические повторы с экспоненциальной задержкой
- 🔄 **Зависшие воркеры** - автоматический перезапуск при таймауте

### Решение проблем v3.0

**Очередь переполнена:**
```bash
# Увеличить размер очереди
echo "MAX_QUEUE_SIZE=100" >> .env
npm restart

# Или добавить воркеров
echo "MAX_CONCURRENT_DOWNLOADS=5" >> .env
npm restart
```

**Воркеры зависают:**
```bash
# Проверить статус воркеров
curl -H "X-API-Key: your-key" http://localhost:3000/api/workers/stats

# Перезапустить воркеры
curl -X POST -H "X-API-Key: your-key" http://localhost:3000/api/workers/restart
```

**Высокое потребление памяти:**
```bash
# Уменьшить количество воркеров
echo "MAX_CONCURRENT_DOWNLOADS=2" >> .env

# Добавить лимит памяти
echo "MAX_MEMORY_USAGE=512" >> .env
npm restart
```

**Низкая производительность:**
```bash
# Проверить метрики
curl -H "X-API-Key: your-key" http://localhost:3000/api/metrics/performance

# Оптимизировать настройки
echo "WORKER_SPAWN_DELAY=500" >> .env
echo "QUEUE_POLL_INTERVAL=1000" >> .env
npm restart
```

## 📊 Мониторинг производительности

### Ключевые метрики:
- **Throughput** - видео в час
- **Average processing time** - среднее время обработки
- **Queue wait time** - время ожидания в очереди
- **Success rate** - процент успешных обработок
- **Resource utilization** - использование CPU/памяти

### Логирование очереди:
```
🚀 Server running with queue system (3 workers, queue size: 50)
📥 Job abc123 added to queue (position: 3, estimated wait: 90s)
🔄 Worker-1 processing job abc123 (1/3 active)
📊 Job abc123 progress: 30% - Downloading video...
📊 Job abc123 progress: 80% - Sending to Telegram...
✅ Job abc123 completed in 45.2s (queue: 2, processed: 127)
🧹 Cleaned 5 old job records and 3 temp files
📈 Hourly stats: 78 videos processed, 96.2% success rate
```

## 🎯 Roadmap сервера v3.x

### v3.1 (планируется)
- [ ] 🔗 **WebSocket поддержка** для мгновенных обновлений
- [ ] 📊 **Web-dashboard** для мониторинга очередей
- [ ] 🌍 **Кластерный режим** с Redis
- [ ] 🤖 **ИИ-оптимизация** порядка обработки

### v3.2 (планируется)
- [ ] 📈 **Приоритетные очереди** для VIP-пользователей
- [ ] 🔄 **Распределенная обработка** на несколько серверов
- [ ] 📱 **Push-уведомления** о статусе задач
- [ ] 🎛️ **Админ-панель** для управления очередями

### v3.3 (планируется)
- [ ] 🧠 **Машинное обучение** для предсказания времени обработки
- [ ] 🌐 **API Gateway** для управления нагрузкой
- [ ] 📊 **Advanced Analytics** с дашбордами
- [ ] 🔐 **Многопользовательский режим** с изоляцией

## 🤝 Contributing v3.0

Особенно приветствуем помощь в развитии системы очередей!

### Приоритетные области:
1. 🚀 **Оптимизация алгоритмов очередей**
2. 📊 **Расширение метрик и аналитики**
3. 🛡️ **Улучшение отказоустойчивости**
4. 🌐 **Масштабирование и кластеризация**

## 📊 Сравнение с предыдущими версиями

| Функция | v2.1 | v3.0 | Улучшение |
|---------|------|------|-----------|
| Обработка видео | 🔄 Последовательная | ⚡ Параллельная | 3x быстрее |
| Пользовательский опыт | ⏳ Ожидание | 🚀 Мгновенно | 100% |
| Отказоустойчивость | ⚠️ Блокировка при ошибке | 🛡️ Изоляция задач | Высокая |
| Мониторинг | 📊 Базовый | 📈 Продвинутый | Полная видимость |
| API | 🔧 Простой | 🌐 RESTful | Богатый функционал |
| Масштабируемость | 📈 Ограниченная | 🚀 Высокая | Легко масштабируется |

## 📞 Поддержка v3.0

- 🐛 **Issues с очередями:** Создавайте с тегом `queue`
- 📊 **Проблемы производительности:** Тег `performance`
- 🔧 **API вопросы:** Тег `api`
- 💬 **Общие вопросы:** Discussions

## 📄 Лицензия

MIT License - используйте свободно для личных и коммерческих проектов.

---

**🚀 Революция в обработке Instagram видео с продвинутыми очередями! 🚀**

**Сервер v3.0 - мощность, надежность, производительность!**

Сделано с ❤️ и передовыми технологиями очередей для максимальной производительности!