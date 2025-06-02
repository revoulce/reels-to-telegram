const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {Telegraf} = require('telegraf');
const {v4: uuidv4} = require('uuid');
const {exec} = require('child_process');
const {promisify} = require('util');
const EventEmitter = require('events');

const execAsync = promisify(exec);

// Конфигурация
const config = {
    PORT: process.env.PORT || 3000,
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN',
    CHANNEL_ID: process.env.CHANNEL_ID || '@your_channel',
    API_KEY: process.env.API_KEY || 'your-secret-api-key',
    TEMP_DIR: './temp',
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    DOWNLOAD_TIMEOUT: 60000, // 60 seconds
    SUPPORTED_DOMAINS: ['instagram.com', 'www.instagram.com'],
    // Настройки очереди
    MAX_CONCURRENT_DOWNLOADS: 3, // Максимум одновременных загрузок
    MAX_QUEUE_SIZE: 50, // Максимум видео в очереди
    QUEUE_TIMEOUT: 10 * 60 * 1000 // 10 минут на обработку одного видео
};

// Создаем временную директорию
if (!fs.existsSync(config.TEMP_DIR)) {
    fs.mkdirSync(config.TEMP_DIR, { recursive: true });
}

// Инициализация
const app = express();
const bot = new Telegraf(config.BOT_TOKEN);

// Система очередей
class VideoQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = new Map(); // jobId -> jobData
        this.processing = new Map(); // jobId -> processingData
        this.completed = new Map(); // jobId -> result (хранится 1 час)
        this.failed = new Map(); // jobId -> error (хранится 1 час)
        this.activeWorkers = 0;

        // Автоочистка завершенных задач
        setInterval(() => this.cleanupCompletedJobs(), 5 * 60 * 1000); // каждые 5 минут
    }

    // Добавить задачу в очередь
    addJob(videoData, userInfo = {}) {
        if (this.queue.size >= config.MAX_QUEUE_SIZE) {
            throw new Error('Queue is full. Please try again later.');
        }

        const jobId = uuidv4();
        const job = {
            id: jobId,
            videoData,
            userInfo,
            addedAt: new Date(),
            status: 'queued',
            progress: 0
        };

        this.queue.set(jobId, job);
        this.emit('jobAdded', job);

        console.log(`📥 Job ${jobId} added to queue (${this.queue.size} in queue)`);

        // Запускаем обработку если есть свободные воркеры
        this.processNext();

        return jobId;
    }

    // Обработать следующую задачу
    async processNext() {
        if (this.activeWorkers >= config.MAX_CONCURRENT_DOWNLOADS) {
            return; // Все воркеры заняты
        }

        if (this.queue.size === 0) {
            return; // Очередь пуста
        }

        // Берем первую задачу из очереди
        const [jobId, job] = this.queue.entries().next().value;
        this.queue.delete(jobId);

        this.activeWorkers++;
        this.processing.set(jobId, { ...job, status: 'processing', startedAt: new Date() });

        console.log(`🚀 Processing job ${jobId} (${this.activeWorkers} active workers)`);

        try {
            const result = await this.processJob(job);

            // Успешно обработано
            this.completed.set(jobId, {
                ...job,
                status: 'completed',
                result,
                completedAt: new Date()
            });

            this.emit('jobCompleted', jobId, result);
            console.log(`✅ Job ${jobId} completed successfully`);

        } catch (error) {
            // Ошибка обработки
            this.failed.set(jobId, {
                ...job,
                status: 'failed',
                error: error.message,
                failedAt: new Date()
            });

            this.emit('jobFailed', jobId, error);
            console.error(`❌ Job ${jobId} failed:`, error.message);
        } finally {
            this.processing.delete(jobId);
            this.activeWorkers--;

            // Запускаем следующую задачу
            setImmediate(() => this.processNext());
        }
    }

    // Обработать одну задачу
    async processJob(job) {
        const { videoData } = job;
        const { videoUrl, pageUrl } = videoData;

        const tempFileName = `video_${job.id}.mp4`;
        const tempFilePath = path.join(config.TEMP_DIR, tempFileName);

        try {
            // Обновляем прогресс
            this.updateJobProgress(job.id, 10, 'Extracting metadata...');

            // Извлекаем метаданные
            const metadata = await extractMetadata(pageUrl);

            this.updateJobProgress(job.id, 30, 'Downloading video...');

            // Скачиваем видео
            await downloadVideo(pageUrl, tempFilePath);

            this.updateJobProgress(job.id, 80, 'Sending to Telegram...');

            // Создаем caption и отправляем в Telegram
            const caption = createCaption(metadata, pageUrl);

            const message = await bot.telegram.sendVideo(
                config.CHANNEL_ID,
                { source: tempFilePath },
                {
                    caption,
                    parse_mode: 'HTML',
                    disable_notification: false
                }
            );

            this.updateJobProgress(job.id, 100, 'Completed');

            // Удаляем временный файл
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }

            return {
                success: true,
                message: 'Video sent to Telegram successfully',
                metadata: {
                    author: metadata.author || 'Unknown',
                    title: metadata.title || 'Instagram Video',
                    views: metadata.view_count,
                    likes: metadata.like_count,
                    duration: metadata.duration
                },
                telegramMessageId: message.message_id
            };

        } catch (error) {
            // Удаляем временный файл в случае ошибки
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            throw error;
        }
    }

    // Обновить прогресс задачи
    updateJobProgress(jobId, progress, message) {
        const job = this.processing.get(jobId);
        if (job) {
            job.progress = progress;
            job.progressMessage = message;
            this.emit('jobProgress', jobId, progress, message);
        }
    }

    // Получить статус задачи
    getJobStatus(jobId) {
        // Проверяем в разных состояниях
        if (this.queue.has(jobId)) {
            return { status: 'queued', ...this.queue.get(jobId) };
        }

        if (this.processing.has(jobId)) {
            return { status: 'processing', ...this.processing.get(jobId) };
        }

        if (this.completed.has(jobId)) {
            return { status: 'completed', ...this.completed.get(jobId) };
        }

        if (this.failed.has(jobId)) {
            return { status: 'failed', ...this.failed.get(jobId) };
        }

        return null; // Задача не найдена
    }

    // Получить статистику очереди
    getQueueStats() {
        return {
            queued: this.queue.size,
            processing: this.processing.size,
            activeWorkers: this.activeWorkers,
            maxWorkers: config.MAX_CONCURRENT_DOWNLOADS,
            completed: this.completed.size,
            failed: this.failed.size,
            maxQueueSize: config.MAX_QUEUE_SIZE
        };
    }

    // Очистка завершенных задач
    cleanupCompletedJobs() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        let cleaned = 0;

        // Очистка завершенных
        for (const [jobId, job] of this.completed.entries()) {
            if (job.completedAt < oneHourAgo) {
                this.completed.delete(jobId);
                cleaned++;
            }
        }

        // Очистка неудачных
        for (const [jobId, job] of this.failed.entries()) {
            if (job.failedAt < oneHourAgo) {
                this.failed.delete(jobId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old job records`);
        }
    }

    // Отменить задачу (только если в очереди)
    cancelJob(jobId) {
        if (this.queue.has(jobId)) {
            this.queue.delete(jobId);
            console.log(`❌ Job ${jobId} cancelled`);
            return true;
        }
        return false;
    }
}

// Создаем экземпляр очереди
const videoQueue = new VideoQueue();

// События очереди для логирования
videoQueue.on('jobCompleted', (jobId, result) => {
    console.log(`📤 Job ${jobId} sent to Telegram:`, result.metadata?.title || 'Video');
});

videoQueue.on('jobFailed', (jobId, error) => {
    console.log(`💥 Job ${jobId} processing failed:`, error.message);
});

// Middleware
app.use(cors({
    origin: [
        'https://www.instagram.com',
        'chrome-extension://*'
    ],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Проверка API ключа
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }
    if (apiKey !== config.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
};

// Валидация URL
const validateInstagramUrl = (url) => {
    try {
        const urlObj = new URL(url);
        const isInstagram = config.SUPPORTED_DOMAINS.includes(urlObj.hostname);
        const isValidPath = urlObj.pathname.includes('/reels/') ||
            urlObj.pathname.includes('/reel/') ||
            urlObj.pathname.includes('/stories/') ||
            urlObj.pathname.includes('/p/');

        return isInstagram && isValidPath;
    } catch {
        return false;
    }
};

// Функции обработки видео (те же что и раньше)
async function extractMetadata(pageUrl) {
    try {
        console.log('📊 Extracting metadata for:', pageUrl);

        const command = `yt-dlp --dump-json --no-download --quiet "${pageUrl}"`;
        const { stdout } = await execAsync(command, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10
        });

        const metadata = JSON.parse(stdout);

        const result = {
            title: cleanText(metadata.title || metadata.description || ''),
            author: cleanText(metadata.uploader || metadata.channel || ''),
            duration: metadata.duration || 0,
            view_count: metadata.view_count || 0,
            like_count: metadata.like_count || 0,
            upload_date: metadata.upload_date || null,
            thumbnail: metadata.thumbnail || null
        };

        console.log('✅ Metadata extracted:', {
            author: result.author || 'Unknown',
            titleLength: result.title.length,
            duration: result.duration,
            views: result.view_count
        });

        return result;
    } catch (error) {
        console.warn('⚠️ Could not extract metadata:', error.message);
        return {
            title: '',
            author: '',
            duration: 0,
            view_count: 0,
            like_count: 0
        };
    }
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
}

async function downloadVideo(pageUrl, outputPath) {
    console.log('📥 Starting download from:', pageUrl);

    const command = `yt-dlp --cookies "cookies.txt" -f "best[ext=mp4]/best" -o "${outputPath}" "${pageUrl}" --no-playlist --max-filesize ${config.MAX_FILE_SIZE}`;

    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout: config.DOWNLOAD_TIMEOUT,
            maxBuffer: 1024 * 1024 * 50
        });

        if (stderr) {
            console.log('yt-dlp warnings:', stderr);
        }

        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 0) {
                console.log(`✅ Download successful: ${formatFileSize(stats.size)}`);
                return outputPath;
            }
        }

        throw new Error('Downloaded file is empty or missing');
    } catch (error) {
        console.error('❌ Download failed:', error.message);

        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        throw error;
    }
}

function formatNumber(num) {
    if (!num || num === 0) return '';

    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }

    return num.toLocaleString();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function createCaption(metadata, pageUrl) {
    let caption = '';

    if (metadata.title) {
        caption += `🎬 ${metadata.title}\n\n`;
    }

    if (metadata.author) {
        caption += `👤 ${metadata.author}\n`;
    }

    if (metadata.view_count > 0) {
        caption += `👁 ${formatNumber(metadata.view_count)} просмотров\n`;
    }

    if (metadata.like_count > 0) {
        caption += `❤️ ${formatNumber(metadata.like_count)} лайков\n`;
    }

    if (metadata.duration > 0) {
        const minutes = Math.floor(metadata.duration / 60);
        const seconds = metadata.duration % 60;
        caption += `⏱ ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
    }

    caption += `\n🔗 ${pageUrl}`;

    return caption.substring(0, 1024);
}

function cleanupOldFiles() {
    const maxAge = 60 * 60 * 1000;
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

// === API ENDPOINTS ===

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        queue: videoQueue.getQueueStats()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        queue: videoQueue.getQueueStats()
    });
});

// Основной endpoint - теперь добавляет в очередь
app.post('/api/download-video', authenticateApiKey, async (req, res) => {
    const { videoUrl, pageUrl, timestamp } = req.body;

    console.log('\n🚀 New video request:', {
        pageUrl,
        hasVideoUrl: !!videoUrl,
        timestamp
    });

    // Валидация
    if (!pageUrl) {
        return res.status(400).json({ error: 'pageUrl is required' });
    }

    if (!validateInstagramUrl(pageUrl)) {
        return res.status(400).json({ error: 'Invalid Instagram URL' });
    }

    try {
        // Добавляем в очередь
        const jobId = videoQueue.addJob(
            { videoUrl, pageUrl, timestamp },
            { ip: req.ip, userAgent: req.get('User-Agent') }
        );

        // Возвращаем ID задачи
        res.json({
            success: true,
            jobId,
            message: 'Video added to processing queue',
            queuePosition: videoQueue.getQueueStats().queued,
            estimatedWaitTime: Math.ceil(videoQueue.getQueueStats().queued / config.MAX_CONCURRENT_DOWNLOADS) * 30 // примерная оценка
        });

    } catch (error) {
        console.error('❌ Error adding to queue:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Проверка статуса задачи
app.get('/api/job/:jobId', authenticateApiKey, (req, res) => {
    const { jobId } = req.params;

    const jobStatus = videoQueue.getJobStatus(jobId);

    if (!jobStatus) {
        return res.status(404).json({ error: 'Job not found' });
    }

    // Скрываем внутренние данные
    const response = {
        jobId,
        status: jobStatus.status,
        progress: jobStatus.progress || 0,
        progressMessage: jobStatus.progressMessage,
        addedAt: jobStatus.addedAt,
        startedAt: jobStatus.startedAt,
        completedAt: jobStatus.completedAt,
        failedAt: jobStatus.failedAt
    };

    // Добавляем результат если завершено
    if (jobStatus.status === 'completed') {
        response.result = jobStatus.result;
    }

    // Добавляем ошибку если провалено
    if (jobStatus.status === 'failed') {
        response.error = jobStatus.error;
    }

    res.json(response);
});

// Отмена задачи
app.delete('/api/job/:jobId', authenticateApiKey, (req, res) => {
    const { jobId } = req.params;

    const cancelled = videoQueue.cancelJob(jobId);

    if (cancelled) {
        res.json({ success: true, message: 'Job cancelled' });
    } else {
        res.status(400).json({ error: 'Job cannot be cancelled (not in queue or already processing)' });
    }
});

// Статистика очереди
app.get('/api/queue/stats', authenticateApiKey, (req, res) => {
    const stats = videoQueue.getQueueStats();

    res.json({
        ...stats,
        config: {
            maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
            maxQueueSize: config.MAX_QUEUE_SIZE,
            queueTimeout: config.QUEUE_TIMEOUT / 1000 / 60 // в минутах
        }
    });
});

// Список всех задач (для админа)
app.get('/api/queue/jobs', authenticateApiKey, (req, res) => {
    const jobs = [];

    // Добавляем задачи из всех состояний
    for (const [id, job] of videoQueue.queue.entries()) {
        jobs.push({ ...job, status: 'queued' });
    }

    for (const [id, job] of videoQueue.processing.entries()) {
        jobs.push({ ...job, status: 'processing' });
    }

    // Ограничиваем количество завершенных
    const completed = Array.from(videoQueue.completed.values()).slice(-20);
    const failed = Array.from(videoQueue.failed.values()).slice(-20);

    jobs.push(...completed, ...failed);

    // Сортируем по времени добавления
    jobs.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    res.json(jobs.slice(0, 100)); // Максимум 100 задач
});

// Endpoint для получения общей статистики
app.get('/api/stats', authenticateApiKey, (req, res) => {
    const tempFiles = fs.readdirSync(config.TEMP_DIR).length;

    res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        tempFiles,
        queue: videoQueue.getQueueStats(),
        config: {
            maxFileSize: formatFileSize(config.MAX_FILE_SIZE),
            downloadTimeout: config.DOWNLOAD_TIMEOUT / 1000 + 's',
            maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
            maxQueueSize: config.MAX_QUEUE_SIZE
        }
    });
});

// Команды бота (обновленные)
bot.command('start', (ctx) => {
    ctx.reply(
        '👋 Привет! Я бот для публикации видео из Instagram Reels.\n\n' +
        '🔧 Установите браузерное расширение и настройте его для автоматической отправки видео в канал.\n\n' +
        '⚡ Новые возможности:\n' +
        '• Очередь обработки видео\n' +
        '• Одновременная загрузка до 3 видео\n' +
        '• Отслеживание статуса\n\n' +
        '📊 Команды:\n' +
        '/info - информация о боте\n' +
        '/stats - статистика работы\n' +
        '/queue - статус очереди'
    );
});

bot.command('queue', async (ctx) => {
    const stats = videoQueue.getQueueStats();

    ctx.reply(
        `📊 Статус очереди:\n\n` +
        `⏳ В очереди: ${stats.queued}\n` +
        `🔄 Обрабатывается: ${stats.processing}\n` +
        `✅ Завершено: ${stats.completed}\n` +
        `❌ Ошибки: ${stats.failed}\n` +
        `👷 Активных воркеров: ${stats.activeWorkers}/${stats.maxWorkers}\n\n` +
        `📈 Максимум в очереди: ${stats.maxQueueSize}`
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

// Обработка ошибок
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// Graceful shutdown
const shutdown = () => {
    console.log('\n🔄 Shutting down gracefully...');

    // Cleanup temp files
    try {
        const files = fs.readdirSync(config.TEMP_DIR);
        files.forEach(file => {
            fs.unlinkSync(path.join(config.TEMP_DIR, file));
        });
        console.log('🧹 Temporary files cleaned');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }

    // Stop bot
    bot.stop('SIGTERM');
    process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Запуск
const start = async () => {
    try {
        // Проверяем зависимости
        await execAsync('yt-dlp --version');
        console.log('✅ yt-dlp found');

        // Запуск сервера
        app.listen(config.PORT, () => {
            console.log(`🚀 Server running on port ${config.PORT}`);
            console.log(`📁 Temp directory: ${config.TEMP_DIR}`);
            console.log(`📺 Telegram channel: ${config.CHANNEL_ID}`);
            console.log(`⚡ Queue: max ${config.MAX_CONCURRENT_DOWNLOADS} concurrent, ${config.MAX_QUEUE_SIZE} queue size`);
        });

        // Запуск бота
        await bot.launch();
        console.log('🤖 Telegram bot started');

        // Периодическая очистка
        setInterval(cleanupOldFiles, 30 * 60 * 1000);

    } catch (error) {
        console.error('❌ Failed to start:', error.message);

        if (error.message.includes('yt-dlp')) {
            console.log('\n💡 Install yt-dlp: pip install yt-dlp');
        }

        process.exit(1);
    }
};

start();