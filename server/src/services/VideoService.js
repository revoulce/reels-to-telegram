const { Telegraf } = require('telegraf');
const config = require('../config');
const errorService = require('./ErrorService');
const VideoQueue = require('../queue/VideoQueue');

/**
 * Video Service - handles all video processing and Telegram operations
 */
class VideoService {
    constructor() {
        this.videoQueue = new VideoQueue();
        this.bot = new Telegraf(config.BOT_TOKEN);
        this.setupCommands();
    }

    /**
     * Add video to processing queue
     */
    async downloadVideo(req) {
        try {
            const { videoUrl, pageUrl, timestamp } = req.body;

            // Validate input
            if (!videoUrl || !pageUrl) {
                throw errorService.createError(
                    errorService.errorTypes.VALIDATION,
                    'Video URL and page URL are required'
                );
            }

            // Check queue capacity
            if (this.videoQueue.queue.size >= config.MAX_QUEUE_SIZE) {
                throw errorService.createError(
                    errorService.errorTypes.QUEUE,
                    `Queue is full (${this.videoQueue.queue.size}/${config.MAX_QUEUE_SIZE}). Please try again later.`
                );
            }

            // Check memory usage
            if (this.videoQueue.memoryManager.wouldExceedLimit()) {
                throw errorService.createError(
                    errorService.errorTypes.MEMORY,
                    'Memory limit would be exceeded',
                    {
                        memoryInfo: {
                            current: this.videoQueue.memoryManager.formatMemory(this.videoQueue.memoryManager.currentUsage),
                            max: this.videoQueue.memoryManager.formatMemory(config.MAX_TOTAL_MEMORY),
                            utilization: Math.round((this.videoQueue.memoryManager.currentUsage / config.MAX_TOTAL_MEMORY) * 100)
                        }
                    }
                );
            }

            // Add to queue
            const jobId = this.videoQueue.addJob({
                videoUrl,
                pageUrl,
                timestamp: timestamp || new Date().toISOString()
            }, {
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });

            return {
                success: true,
                jobId,
                queuePosition: this.videoQueue.queue.size,
                estimatedWaitTime: this.videoQueue.getEstimatedWaitTime()
            };

        } catch (error) {
            throw errorService.createError(
                error.type || errorService.errorTypes.SERVER,
                error.message,
                error.details
            );
        }
    }

    /**
     * Get job status
     */
    async getJobStatus(req, res) {
        const { jobId } = req.params;
        const jobStatus = this.videoQueue.getJobStatus(jobId);

        if (!jobStatus) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        const response = {
            jobId,
            status: jobStatus.status,
            progress: jobStatus.progress || 0,
            progressMessage: jobStatus.progressMessage,
            addedAt: jobStatus.addedAt,
            startedAt: jobStatus.startedAt,
            completedAt: jobStatus.completedAt,
            failedAt: jobStatus.failedAt,
            processing: {
                mode: 'memory',
                estimatedSize: jobStatus.estimatedSize
            }
        };

        if (jobStatus.status === 'completed') {
            response.result = jobStatus.result;
        }

        if (jobStatus.status === 'failed') {
            response.error = jobStatus.error;
        }

        res.json(response);
    }

    /**
     * Cancel job
     */
    async cancelJob(req, res) {
        const { jobId } = req.params;
        const cancelled = this.videoQueue.cancelJob(jobId);

        res.json({
            success: cancelled,
            message: cancelled ?
                'Job cancelled successfully' :
                'Job cannot be cancelled (not in queue or already processing)'
        });
    }

    /**
     * Send video to Telegram channel from memory buffer
     */
    async sendVideo(videoBuffer, metadata, pageUrl, jobId) {
        const caption = this.createCaption(metadata, pageUrl);

        try {
            const message = await this.bot.telegram.sendVideo(
                config.CHANNEL_ID,
                {
                    source: videoBuffer,
                    filename: `reel_${jobId.substring(0, 8)}.mp4`
                },
                {
                    caption,
                    parse_mode: 'HTML',
                    disable_notification: false
                }
            );

            console.log(`📤 Video sent to Telegram: ${metadata.title || 'Untitled'}`);
            return message;

        } catch (error) {
            console.error(`❌ Telegram send failed:`, error.message);
            throw new Error(`Failed to send to Telegram: ${error.message}`);
        }
    }

    /**
     * Create caption for Telegram message
     */
    createCaption(metadata, pageUrl) {
        let caption = '';

        if (metadata.title) {
            caption += `🎬 ${metadata.title}\n\n`;
        }

        if (metadata.author) {
            caption += `👤 ${metadata.author}\n`;
        }

        if (metadata.view_count > 0) {
            caption += `👁 ${this.formatNumber(metadata.view_count)} просмотров\n`;
        }

        if (metadata.like_count > 0) {
            caption += `❤️ ${this.formatNumber(metadata.like_count)} лайков\n`;
        }

        if (metadata.duration > 0) {
            const minutes = Math.floor(metadata.duration / 60);
            const seconds = metadata.duration % 60;
            caption += `⏱ ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
        }

        caption += `\n🔗 ${pageUrl}`;

        return caption.substring(0, 1024);
    }

    /**
     * Format number with K/M suffixes
     */
    formatNumber(num) {
        if (!num || num === 0) return '';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    /**
     * Setup bot commands
     */
    setupCommands() {
        this.bot.command('start', (ctx) => {
            ctx.reply(
                '👋 Привет! Я бот для публикации видео из Instagram Reels.\n\n' +
                '🔧 Установите браузерное расширение и настройте его для автоматической отправки видео в канал.\n\n' +
                '⚡ Memory Edition v3.0 возможности:\n' +
                '• 💾 Обработка видео в памяти (zero disk usage)\n' +
                '• 🚀 Очередь до 3 видео одновременно\n' +
                '• 📊 Отслеживание статуса в реальном времени\n' +
                '• 🧹 Автоматическая очистка памяти\n\n' +
                '📊 Команды:\n' +
                '/memory - статистика использования памяти\n' +
                '/queue - статус очереди\n' +
                '/stats - общая статистика\n' +
                '/info - информация о боте'
            );
        });
    }

    /**
     * Set up command handlers with access to queue stats
     */
    setupStatsCommands(getQueueStats, getMemoryStats) {
        this.bot.command('memory', async (ctx) => {
            const memoryStats = getMemoryStats();
            const processMemory = process.memoryUsage();

            ctx.reply(
                `💾 Использование памяти:\n\n` +
                `🔄 Очередь: ${memoryStats.currentFormatted} / ${memoryStats.maxFormatted} (${memoryStats.utilization}%)\n` +
                `📈 Пик: ${memoryStats.peakFormatted}\n` +
                `🖥 Процесс: ${this.formatMemory(processMemory.rss)}\n` +
                `📊 Heap: ${this.formatMemory(processMemory.heapUsed)} / ${this.formatMemory(processMemory.heapTotal)}\n\n` +
                `📹 Активных выделений: ${memoryStats.activeAllocations}\n` +
                `⚡ Режим: Zero disk usage\n` +
                `📈 Обработано всего: ${getQueueStats().totalProcessed}`
            );
        });

        this.bot.command('queue', async (ctx) => {
            const stats = getQueueStats();
            const memoryStats = getMemoryStats();

            ctx.reply(
                `📊 Статус очереди (Memory Mode):\n\n` +
                `⏳ В очереди: ${stats.queued}\n` +
                `🔄 Обрабатывается: ${stats.processing}\n` +
                `✅ Завершено: ${stats.completed}\n` +
                `❌ Ошибки: ${stats.failed}\n` +
                `👷 Активных воркеров: ${stats.processing}/${config.MAX_CONCURRENT_DOWNLOADS}\n\n` +
                `💾 Память: ${memoryStats.currentFormatted} / ${memoryStats.maxFormatted} (${memoryStats.utilization}%)\n` +
                `📈 Производительность: ${stats.throughputPerMinute} видео/мин\n` +
                `🚀 Обработка: В памяти без использования диска`
            );
        });

        this.bot.command('stats', async (ctx) => {
            const uptime = Math.floor(process.uptime());
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const queueStats = getQueueStats();
            const memoryStats = getMemoryStats();

            ctx.reply(
                `📊 Статистика сервера Memory Edition:\n\n` +
                `⏱ Время работы: ${hours}ч ${minutes}м\n` +
                `💾 Память процесса: ${this.formatMemory(process.memoryUsage().rss)}\n` +
                `🔄 Статус: Активен (Memory Mode)\n\n` +
                `📊 Очередь:\n` +
                `• Ожидает: ${queueStats.queued}\n` +
                `• Обрабатывается: ${queueStats.processing}\n` +
                `• Завершено: ${queueStats.completed}\n` +
                `• Ошибки: ${queueStats.failed}\n\n` +
                `💾 Память очереди: ${memoryStats.currentFormatted}\n` +
                `📈 Производительность: ${queueStats.throughputPerMinute} видео/мин\n` +
                `🏆 Пик памяти: ${memoryStats.peakFormatted}`
            );
        });
    }

    /**
     * Format memory helper
     */
    formatMemory(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Start the bot
     */
    async launch() {
        await this.bot.launch();
        console.log('🤖 Telegram bot started');
    }

    /**
     * Stop the service
     * @param {string} signal - Signal to stop with
     */
    stop(signal = 'SIGTERM') {
        if (this.bot) {
            this.bot.stop(signal);
        }
    }
}

module.exports = VideoService;
