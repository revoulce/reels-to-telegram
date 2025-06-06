const { Telegraf } = require('telegraf');
const config = require('../config');

/**
 * Telegram Service - handles all Telegram bot operations
 */
class TelegramService {
    constructor() {
        this.bot = new Telegraf(config.BOT_TOKEN);
        this.setupCommands();
    }

    /**
     * Send video to Telegram channel from memory buffer
     * @param {Buffer} videoBuffer
     * @param {object} metadata
     * @param {string} pageUrl
     * @param {string} jobId
     * @returns {Promise<object>}
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
     * @param {object} metadata
     * @param {string} pageUrl
     * @returns {string}
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
     * @param {number} num
     * @returns {string}
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

        // Commands will be set up by the main VideoQueue when it has access to stats
    }

    /**
     * Set up command handlers with access to queue stats
     * @param {function} getQueueStats
     * @param {function} getMemoryStats
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
     * @param {number} bytes
     * @returns {string}
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
     * Stop the bot
     */
    stop(signal = 'SIGTERM') {
        this.bot.stop(signal);
    }
}

module.exports = TelegramService;