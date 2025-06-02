const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {Telegraf} = require('telegraf');
const {v4: uuidv4} = require('uuid');
const {exec} = require('child_process');
const {promisify} = require('util');

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
    SUPPORTED_DOMAINS: ['instagram.com', 'www.instagram.com']
};

// Создаем временную директорию
if (!fs.existsSync(config.TEMP_DIR)) {
    fs.mkdirSync(config.TEMP_DIR, { recursive: true });
}

// Инициализация
const app = express();
const bot = new Telegraf(config.BOT_TOKEN);

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

// Улучшенная функция извлечения метаданных
async function extractMetadata(pageUrl) {
    try {
        console.log('📊 Extracting metadata for:', pageUrl);

        const command = `yt-dlp --dump-json --no-download --quiet "${pageUrl}"`;
        const { stdout } = await execAsync(command, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
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

// Функция для очистки текста
function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove some emojis if needed
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200); // Limit length
}

// Скачивание видео
async function downloadVideo(pageUrl, outputPath) {
    console.log('📥 Starting download from:', pageUrl);

    const command = `yt-dlp --cookies "cookies.txt" -f "best[ext=mp4]/best" -o "${outputPath}" "${pageUrl}" --no-playlist --max-filesize ${config.MAX_FILE_SIZE}`;

    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout: config.DOWNLOAD_TIMEOUT,
            maxBuffer: 1024 * 1024 * 50 // 50MB buffer
        });

        if (stderr) {
            console.log('yt-dlp warnings:', stderr);
        }

        // Проверяем, что файл создан и не пустой
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

        // Cleanup incomplete file
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        throw error;
    }
}

// Форматирование чисел
function formatNumber(num) {
    if (!num || num === 0) return '';

    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }

    return num.toLocaleString();
}

// Форматирование размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Создание caption для Telegram
function createCaption(metadata, pageUrl) {
    let caption = '';

    // Заголовок/описание
    if (metadata.title) {
        caption += `🎬 ${metadata.title}\n\n`;
    }

    // Автор
    if (metadata.author) {
        caption += `👤 ${metadata.author}\n`;
    }

    // Статистика
    if (metadata.view_count > 0) {
        caption += `👁 ${formatNumber(metadata.view_count)} просмотров\n`;
    }

    if (metadata.like_count > 0) {
        caption += `❤️ ${formatNumber(metadata.like_count)} лайков\n`;
    }

    // Длительность
    if (metadata.duration > 0) {
        const minutes = Math.floor(metadata.duration / 60);
        const seconds = metadata.duration % 60;
        caption += `⏱ ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
    }

    // Источник
    caption += `\n🔗 ${pageUrl}`;

    return caption.substring(0, 1024); // Telegram limit
}

// Cleanup старых файлов
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

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '2.1.0',
        timestamp: new Date().toISOString()
    });
});

// Основной endpoint для обработки видео
app.post('/api/download-video', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();
    const { videoUrl, pageUrl, timestamp } = req.body;

    console.log('\n🚀 New video processing request:', {
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

    const tempFileName = `video_${uuidv4()}.mp4`;
    const tempFilePath = path.join(config.TEMP_DIR, tempFileName);

    try {
        // Очистка старых файлов
        cleanupOldFiles();

        // Извлекаем метаданные
        const metadata = await extractMetadata(pageUrl);

        // Скачиваем видео
        await downloadVideo(pageUrl, tempFilePath);

        // Создаем caption
        const caption = createCaption(metadata, pageUrl);

        console.log('📤 Sending to Telegram...');
        console.log('Caption preview:', caption.substring(0, 100) + '...');

        // Отправляем в Telegram
        const message = await bot.telegram.sendVideo(
            config.CHANNEL_ID,
            { source: tempFilePath },
            {
                caption,
                parse_mode: 'HTML',
                disable_notification: false
            }
        );

        console.log(`✅ Video sent successfully in ${Date.now() - startTime}ms`);

        // Удаляем временный файл
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        res.json({
            success: true,
            message: 'Video sent to Telegram successfully',
            processingTime: Date.now() - startTime,
            metadata: {
                author: metadata.author || 'Unknown',
                title: metadata.title || 'Instagram Video',
                views: metadata.view_count,
                likes: metadata.like_count,
                duration: metadata.duration
            },
            telegramMessageId: message.message_id
        });

    } catch (error) {
        console.error('❌ Error processing video:', error.message);

        // Удаляем временный файл в случае ошибки
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        let errorMessage = 'Failed to process video';
        let statusCode = 500;

        if (error.message.includes('timeout')) {
            errorMessage = 'Download timeout - video might be too large';
            statusCode = 408;
        } else if (error.message.includes('Unauthorized') || error.message.includes('403')) {
            errorMessage = 'Access denied - video might be private';
            statusCode = 403;
        } else if (error.message.includes('not available')) {
            errorMessage = 'Video not available or deleted';
            statusCode = 404;
        }

        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            processingTime: Date.now() - startTime
        });
    }
});

// Endpoint для получения статистики
app.get('/api/stats', authenticateApiKey, (req, res) => {
    const tempFiles = fs.readdirSync(config.TEMP_DIR).length;

    res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        tempFiles,
        config: {
            maxFileSize: formatFileSize(config.MAX_FILE_SIZE),
            downloadTimeout: config.DOWNLOAD_TIMEOUT / 1000 + 's'
        }
    });
});

// Обработка команд бота
bot.command('start', (ctx) => {
    ctx.reply(
        '👋 Привет! Я бот для публикации видео из Instagram Reels.\n\n' +
        '🔧 Установите браузерное расширение и настройте его для автоматической отправки видео в канал.\n\n' +
        '📊 Команды:\n' +
        '/info - информация о боте\n' +
        '/stats - статистика работы'
    );
});

bot.command('info', (ctx) => {
    ctx.reply(
        '🤖 Instagram to Telegram Bot v2.1\n\n' +
        '📝 Функции:\n' +
        '• Скачивание видео из Instagram Reels и Stories\n' +
        '• Автоматическое извлечение метаданных\n' +
        '• Публикация в Telegram канал\n' +
        '• Поддержка браузерного расширения\n\n' +
        '🛠 Технологии: Node.js + yt-dlp + Telegraf'
    );
});

bot.command('stats', async (ctx) => {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    ctx.reply(
        `📊 Статистика сервера:\n\n` +
        `⏱ Время работы: ${hours}ч ${minutes}м\n` +
        `💾 Память: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n` +
        `📁 Временных файлов: ${fs.readdirSync(config.TEMP_DIR).length}\n` +
        `🔄 Статус: Активен`
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
        });

        // Запуск бота
        await bot.launch();
        console.log('🤖 Telegram bot started');

        // Периодическая очистка
        setInterval(cleanupOldFiles, 30 * 60 * 1000); // Every 30 minutes

    } catch (error) {
        console.error('❌ Failed to start:', error.message);

        if (error.message.includes('yt-dlp')) {
            console.log('\n💡 Install yt-dlp: pip install yt-dlp');
        }

        process.exit(1);
    }
};

start();