# 🚀 Queue System Documentation v3.0

Документация по системе очередей Reels to Telegram на основе реального кода.

## 📋 Содержание

- [Обзор системы](#обзор-системы)
- [Архитектура](#архитектура)
- [Жизненный цикл задач](#жизненный-цикл-задач)
- [Конфигурация](#конфигурация)
- [Мониторинг](#мониторинг)
- [Использование](#использование)

## 🎯 Обзор системы

### Что реализовано

Система очередей v3.0 включает:

- ⚡ **Мгновенное добавление** видео в очередь без ожидания
- 🔄 **Параллельная обработка** до 3 видео одновременно (настраивается)
- 📊 **Отслеживание прогресса** каждой задачи в реальном времени
- 🛡️ **Изоляция ошибок** - сбой одного видео не влияет на другие
- 🧹 **Автоочистка** завершенных задач каждые 30 минут

### Ключевые преимущества

- **Мгновенная отправка** - видео добавляются в очередь за <100мс
- **Параллельная обработка** - 3 воркера работают одновременно
- **Отказоустойчивость** - изоляция задач друг от друга
- **Прозрачность** - полная видимость процесса через панель очереди

## 🏗️ Архитектура

### VideoQueue класс

Основной компонент из `server.js`:

```javascript
class VideoQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = new Map();        // Очередь задач
        this.processing = new Map();   // Активные задачи  
        this.completed = new Map();    // Завершенные задачи
        this.failed = new Map();       // Неудачные задачи
        this.activeWorkers = 0;        // Счетчик воркеров
    }
    
    // Основные методы
    addJob(videoData, userInfo) { /* добавление в очередь */ }
    processNext() { /* запуск следующей задачи */ }
    processJob(job) { /* обработка одной задачи */ }
    getJobStatus(jobId) { /* получение статуса */ }
    cancelJob(jobId) { /* отмена задачи */ }
    cleanupCompletedJobs() { /* очистка старых задач */ }
}
```

### Состояния задач

```javascript
const job = {
    id: "uuid-v4",
    videoData: {
        videoUrl: "blob:...",
        pageUrl: "https://instagram.com/reels/...",
        timestamp: "2024-01-01T00:00:00.000Z"
    },
    userInfo: { ip: "192.168.1.1", userAgent: "Chrome/..." },
    status: "queued",     // queued | processing | completed | failed
    progress: 0,          // 0-100
    progressMessage: "",  // "Downloading video..."
    addedAt: Date,
    startedAt: Date,
    completedAt: Date
};
```

## 🔄 Жизненный цикл задач

### 1. Добавление в очередь

```javascript
// POST /api/download-video возвращает:
{
    "success": true,
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Video added to processing queue",
    "queuePosition": 3,
    "estimatedWaitTime": 90
}
```

### 2. Обработка с прогрессом

Этапы из `processJob()`:
```javascript
// 10% - Извлечение метаданных
this.updateJobProgress(jobId, 10, 'Extracting metadata...');

// 30% - Скачивание видео  
this.updateJobProgress(jobId, 30, 'Downloading video...');

// 80% - Отправка в Telegram
this.updateJobProgress(jobId, 80, 'Sending to Telegram...');

// 100% - Завершено
this.updateJobProgress(jobId, 100, 'Completed');
```

### 3. События очереди

```javascript
// События из VideoQueue
videoQueue.on('jobAdded', (job) => {
    console.log(`📥 Job ${job.id} added (queue: ${this.queue.size})`);
});

videoQueue.on('jobCompleted', (jobId, result) => {
    console.log(`✅ Job ${jobId} completed successfully`);
});

videoQueue.on('jobFailed', (jobId, error) => {
    console.error(`❌ Job ${jobId} failed:`, error.message);
});

videoQueue.on('jobProgress', (jobId, progress, message) => {
    // Обновление прогресса
});
```

### 4. Автоочистка

```javascript
// Каждые 30 минут из server.js
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// Очистка завершенных задач каждые 5 минут
cleanupCompletedJobs() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [jobId, job] of this.completed.entries()) {
        if (job.completedAt < oneHourAgo) {
            this.completed.delete(jobId);
        }
    }
}
```

## ⚙️ Конфигурация

### Environment Variables (.env)

Реальные параметры из `server.js`:

```bash
# Основные настройки
PORT=3000
BOT_TOKEN=your_telegram_bot_token
CHANNEL_ID=@your_channel
API_KEY=your-secret-64-char-api-key

# Настройки очередей (реально используемые)
MAX_CONCURRENT_DOWNLOADS=3      # Максимум одновременных загрузок
MAX_QUEUE_SIZE=50              # Максимум задач в очереди
QUEUE_TIMEOUT=600000           # Таймаут обработки (10 минут)

# Ограничения файлов
MAX_FILE_SIZE=52428800         # 50MB
DOWNLOAD_TIMEOUT=60000         # 60 секунд
```

### Значения по умолчанию

Из конфигурации в `server.js`:
```javascript
const config = {
    PORT: process.env.PORT || 3000,
    MAX_CONCURRENT_DOWNLOADS: 3,
    MAX_QUEUE_SIZE: 50,
    QUEUE_TIMEOUT: 10 * 60 * 1000, // 10 минут
    TEMP_DIR: './temp',
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    DOWNLOAD_TIMEOUT: 60000 // 60 секунд
};
```

## 📊 Мониторинг

### API Endpoints (реально реализованные)

```javascript
// GET /api/health - проверка здоровья
{
    "status": "OK",
    "version": "3.0.0", 
    "timestamp": "2024-01-01T00:00:00.000Z",
    "queue": videoQueue.getQueueStats()
}

// GET /api/queue/stats - статистика очереди
{
    "queued": 5,
    "processing": 2,
    "activeWorkers": 2,
    "maxWorkers": 3,
    "completed": 127,
    "failed": 3,
    "maxQueueSize": 50
}

// GET /api/job/:jobId - статус задачи
{
    "jobId": "550e8400...",
    "status": "processing",
    "progress": 65,
    "progressMessage": "Sending to Telegram...",
    "addedAt": "2024-01-01T00:00:00.000Z"
}

// GET /api/queue/jobs - список задач с пагинацией
{
    "jobs": [...],
    "pagination": {
        "total": 135,
        "limit": 50,
        "offset": 0,
        "hasMore": true
    }
}
```

### Логирование

Примеры реальных логов из `server.js`:
```javascript
console.log(`📥 Job ${jobId} added to queue (${this.queue.size} in queue)`);
console.log(`🚀 Processing job ${jobId} (${this.activeWorkers} active workers)`);
console.log(`✅ Job ${jobId} completed successfully`);
console.error(`❌ Job ${jobId} failed:`, error.message);
console.log(`🧹 Cleaned ${cleaned} old files`);
```

## 🎮 Использование

### Расширение

Из `content.js` - панель очереди:
```javascript
// Hotkeys для панели очереди
button.addEventListener('click', (e) => {
    if (e.shiftKey) {
        this.queuePanel.toggle(); // Shift+click
    } else {
        this.handleClick();
    }
});

// Long press (500ms)
button.addEventListener('mousedown', () => {
    pressTimer = setTimeout(() => {
        this.queuePanel.toggle();
    }, 500);
});
```

### Мониторинг прогресса

Из `background.js`:
```javascript
// Polling каждые 2 секунды
const pollStatus = async () => {
    const status = await this.getJobStatus(jobId);
    this.notifyProgress(jobId, status);
    
    if (status.status === 'completed' || status.status === 'failed') {
        this.cleanupJob(jobId, status.status, status);
    } else {
        setTimeout(pollStatus, 2000); // CONFIG.POLL_INTERVAL
    }
};
```

### Popup статистика

Из `popup.js`:
```javascript
// Автообновление каждые 10 секунд
this.queueInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
        this.loadQueueStats();
    }
}, 10000);
```

## 🛠️ Команды бота

Реальные команды из `server.js`:

```javascript
bot.command('queue', async (ctx) => {
    const stats = videoQueue.getQueueStats();
    
    ctx.reply(
        `📊 Статус очереди:\n\n` +
        `⏳ В очереди: ${stats.queued}\n` +
        `🔄 Обрабатывается: ${stats.processing}\n` +
        `✅ Завершено: ${stats.completed}\n` +
        `❌ Ошибки: ${stats.failed}\n` +
        `👷 Активных воркеров: ${stats.activeWorkers}/${stats.maxWorkers}`
    );
});

bot.command('stats', async (ctx) => {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const queueStats = videoQueue.getQueueStats();

    ctx.reply(
        `📊 Статистика сервера:\n\n` +
        `⏱ Время работы: ${hours}ч ${minutes}м\n` +
        `💾 Память: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n` +
        `📁 Временных файлов: ${fs.readdirSync(config.TEMP_DIR).length}\n` +
        `🔄 Статус: Активен\n\n` +
        `📊 Очередь:\n` +
        `• Ожидает: ${queueStats.queued}\n` +
        `• Обрабатывается: ${queueStats.processing}\n` +
        `• Завершено: ${queueStats.completed}\n` +
        `• Ошибки: ${queueStats.failed}`
    );
});
```

## 🧹 Обслуживание

### Автоматическая очистка

Из `server.js`:
```javascript
// Cleanup старых файлов каждые 30 минут
setInterval(cleanupOldFiles, 30 * 60 * 1000);

function cleanupOldFiles() {
    const maxAge = 60 * 60 * 1000; // 1 hour
    const now = Date.now();

    try {
        const files = fs.readdirSync(config.TEMP_DIR);
        let cleaned = 0;

        files.forEach(file => {
            const filePath = path.join(config.TEMP_DIR, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        });

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old files`);
        }
    } catch (error) {
        console.error('Error cleaning old files:', error);
    }
}

// Очистка завершенных задач каждые 5 минут  
setInterval(() => videoQueue.cleanupCompletedJobs(), 5 * 60 * 1000);
```

### Graceful shutdown

```javascript
const shutdown = () => {
    console.log('\n🔄 Shutting down gracefully...');

    try {
        const files = fs.readdirSync(config.TEMP_DIR);
        files.forEach(file => {
            fs.unlinkSync(path.join(config.TEMP_DIR, file));
        });
        console.log('🧹 Temporary files cleaned');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }

    bot.stop('SIGTERM');
    process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

---

## 📚 Примечания

Эта документация основана на реально реализованном коде из файлов:
- `server/server.js` - основная логика очередей
- `extension/background.js` - мониторинг задач
- `extension/content.js` - панель очереди и UI
- `extension/popup.js` - статистика в popup

Все описанные функции действительно работают и протестированы.