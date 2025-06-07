const { Telegraf } = require("telegraf");
const config = require("../config");

/**
 * Telegram Service - handles all Telegram bot operations
 * Supports media groups for multiple photos
 */
class TelegramService {
  constructor() {
    this.bot = new Telegraf(config.BOT_TOKEN);
    this.setupCommands();
  }

  /**
   * Send media to Telegram channel from memory buffer(s)
   * @param {Buffer|Buffer[]} mediaBuffers
   * @param {object} metadata
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {string} mediaType
   * @param {boolean} isMultiple
   * @returns {Promise<object>}
   */
  async sendMedia(
    mediaBuffers,
    metadata,
    pageUrl,
    jobId,
    mediaType = "auto",
    isMultiple = false
  ) {
    if (!mediaBuffers) {
      throw new Error("Media buffers are required");
    }

    const buffers = Array.isArray(mediaBuffers) ? mediaBuffers : [mediaBuffers];

    // Фильтруем валидные буферы
    const validBuffers = buffers.filter(
      (buffer) => buffer && Buffer.isBuffer(buffer) && buffer.length > 0
    );

    if (validBuffers.length === 0) {
      throw new Error("No valid media buffers found");
    }

    if (validBuffers.length === 1) {
      // Одиночное медиа
      if (mediaType === "photo" || this.isImageContent(validBuffers[0])) {
        return this.sendPhoto(validBuffers[0], metadata, pageUrl, jobId);
      } else {
        return this.sendVideo(validBuffers[0], metadata, pageUrl, jobId);
      }
    } else {
      // Множественные фото - отправляем как медиа-группу
      return this.sendMediaGroup(validBuffers, metadata, pageUrl, jobId);
    }
  }

  /**
   * Send multiple photos as media group to Telegram channel
   * @param {Buffer[]} photoBuffers
   * @param {object} metadata
   * @param {string} pageUrl
   * @param {string} jobId
   * @returns {Promise<object>}
   */
  async sendMediaGroup(photoBuffers, metadata, pageUrl, jobId) {
    const caption = this.createCaption(metadata, pageUrl);

    try {
      const mediaGroup = photoBuffers.map((buffer, index) => ({
        type: "photo",
        media: {
          source: buffer,
          filename: `post_${jobId.substring(0, 8)}_${index + 1}.jpg`,
        },
        // Добавляем caption только к первому фото
        ...(index === 0 && { caption, parse_mode: "HTML" }),
      }));

      const messages = await this.bot.telegram.sendMediaGroup(
        config.CHANNEL_ID,
        mediaGroup
      );

      console.log(
        `📤 Media group sent to Telegram: ${photoBuffers.length} photos`
      );

      return {
        message_id: messages[0].message_id, // ID первого сообщения
        media_group_id: messages[0].media_group_id,
        photos_count: photoBuffers.length,
        messages: messages,
      };
    } catch (error) {
      console.error(`❌ Telegram media group send failed:`, error.message);
      throw new Error(
        `Failed to send media group to Telegram: ${error.message}`
      );
    }
  }

  /**
   * Send photo to Telegram channel from memory buffer
   * @param {Buffer} photoBuffer
   * @param {object} metadata
   * @param {string} pageUrl
   * @param {string} jobId
   * @returns {Promise<object>}
   */
  async sendPhoto(photoBuffer, metadata, pageUrl, jobId) {
    const caption = this.createCaption(metadata, pageUrl);

    try {
      const message = await this.bot.telegram.sendPhoto(
        config.CHANNEL_ID,
        {
          source: photoBuffer,
          filename: `post_${jobId.substring(0, 8)}.jpg`,
        },
        {
          caption,
          parse_mode: "HTML",
        }
      );

      console.log(`📤 Photo sent to Telegram: ${metadata.title || "Untitled"}`);
      return message;
    } catch (error) {
      throw new Error(`Failed to send photo to Telegram: ${error.message}`);
    }
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
          filename: `reel_${jobId.substring(0, 8)}.mp4`,
        },
        {
          caption,
          parse_mode: "HTML",
          disable_notification: false,
        }
      );

      console.log(`📤 Video sent to Telegram: ${metadata.title || "Untitled"}`);
      return message;
    } catch (error) {
      console.error(`❌ Telegram send failed:`, error.message);
      throw new Error(`Failed to send to Telegram: ${error.message}`);
    }
  }

  /**
   * Check if buffer contains image content
   * @param {Buffer} buffer
   * @returns {boolean}
   */
  isImageContent(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 8) {
      return false;
    }

    const header = buffer.slice(0, 8);
    return (
      (buffer[0] === 0xff && buffer[1] === 0xd8) || // JPEG
      header.toString("hex").startsWith("89504e47") || // PNG
      header.toString("hex").startsWith("47494638")
    ); // GIF
  }

  /**
   * Create caption for Telegram message
   * @param {object} metadata
   * @param {string} pageUrl
   * @returns {string}
   */
  createCaption(metadata, pageUrl) {
    let caption = "";

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
      caption += `⏱ ${minutes}:${seconds.toString().padStart(2, "0")}\n`;
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
    if (!num || num === 0) return "";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString();
  }

  /**
   * Setup bot commands
   */
  setupCommands() {
    this.bot.command("start", (ctx) => {
      ctx.reply(
        "👋 Привет! Я бот для публикации контента из Instagram.\n\n" +
          "🔧 Установите браузерное расширение и настройте его для автоматической отправки контента в канал.\n\n" +
          "⚡ Memory Edition v4.0 возможности:\n" +
          "• 💾 Обработка в памяти (zero disk usage)\n" +
          "• 🚀 Очередь до 5 видео одновременно\n" +
          "• 📊 Отслеживание статуса в реальном времени\n" +
          "• 🧹 Автоматическая очистка памяти\n" +
          "• 📸 Поддержка множественных фото\n" +
          "• 🎥 Умное определение типа контента\n\n" +
          "📊 Команды:\n" +
          "/memory - статистика использования памяти\n" +
          "/queue - статус очереди\n" +
          "/stats - общая статистика\n" +
          "/info - информация о боте"
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
    this.bot.command("memory", async (ctx) => {
      const memoryStats = getMemoryStats();
      const processMemory = process.memoryUsage();

      ctx.reply(
        `💾 Использование памяти:\n\n` +
          `🔄 Очередь: ${memoryStats.currentFormatted} / ${memoryStats.maxFormatted} (${memoryStats.utilization}%)\n` +
          `📈 Пик: ${memoryStats.peakFormatted}\n` +
          `🖥 Процесс: ${this.formatMemory(processMemory.rss)}\n` +
          `📊 Heap: ${this.formatMemory(
            processMemory.heapUsed
          )} / ${this.formatMemory(processMemory.heapTotal)}\n\n` +
          `📹 Активных выделений: ${memoryStats.activeAllocations}\n` +
          `⚡ Режим: Zero disk usage\n` +
          `📈 Обработано всего: ${getQueueStats().totalProcessed}`
      );
    });

    this.bot.command("queue", async (ctx) => {
      const stats = getQueueStats();
      const memoryStats = getMemoryStats();

      ctx.reply(
        `📊 Статус очереди (Memory Mode v4.0):\n\n` +
          `⏳ В очереди: ${stats.queued}\n` +
          `🔄 Обрабатывается: ${stats.processing}\n` +
          `✅ Завершено: ${stats.completed}\n` +
          `❌ Ошибки: ${stats.failed}\n` +
          `👷 Активных воркеров: ${stats.processing}/${config.MAX_CONCURRENT_DOWNLOADS}\n\n` +
          `💾 Память: ${memoryStats.currentFormatted} / ${memoryStats.maxFormatted} (${memoryStats.utilization}%)\n` +
          `📈 Производительность: ${stats.throughputPerMinute} видео/мин\n` +
          `🚀 Обработка: В памяти без использования диска\n` +
          `📸 Поддержка: Множественные фото в постах\n` +
          `🎥 Умное определение: Видео или фото контент`
      );
    });

    this.bot.command("stats", async (ctx) => {
      const uptime = Math.floor(process.uptime());
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const queueStats = getQueueStats();
      const memoryStats = getMemoryStats();

      ctx.reply(
        `📊 Статистика сервера Memory Edition v4.0:\n\n` +
          `⏱ Время работы: ${hours}ч ${minutes}м\n` +
          `💾 Память процесса: ${this.formatMemory(
            process.memoryUsage().rss
          )}\n` +
          `🔄 Статус: Активен (Memory Mode)\n\n` +
          `📊 Очередь:\n` +
          `• Ожидает: ${queueStats.queued}\n` +
          `• Обрабатывается: ${queueStats.processing}\n` +
          `• Завершено: ${queueStats.completed}\n` +
          `• Ошибки: ${queueStats.failed}\n\n` +
          `💾 Память очереди: ${memoryStats.currentFormatted}\n` +
          `📈 Производительность: ${queueStats.throughputPerMinute} видео/мин\n` +
          `🏆 Пик памяти: ${memoryStats.peakFormatted}\n` +
          `📸 Поддержка множественных фото\n` +
          `🎥 Умное определение типа контента`
      );
    });
  }

  /**
   * Format memory helper
   * @param {number} bytes
   * @returns {string}
   */
  formatMemory(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Start the bot
   */
  async launch() {
    await this.bot.launch();
    console.log("🤖 Telegram bot started");
  }

  /**
   * Stop the bot
   */
  stop(signal = "SIGTERM") {
    this.bot.stop(signal);
  }
}

module.exports = TelegramService;
