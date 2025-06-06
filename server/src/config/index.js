const Joi = require('joi');

// Configuration schema validation
const configSchema = Joi.object({
    PORT: Joi.number().default(3000),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('production'),

    // Telegram
    BOT_TOKEN: Joi.string().required(),
    CHANNEL_ID: Joi.string().required(),

    // Memory limits (bytes)
    MAX_MEMORY_PER_VIDEO: Joi.number().default(50 * 1024 * 1024), // 50MB
    MAX_TOTAL_MEMORY: Joi.number().default(200 * 1024 * 1024), // 200MB
    MAX_FILE_SIZE: Joi.number().default(50 * 1024 * 1024),

    // Queue settings
    MAX_CONCURRENT_DOWNLOADS: Joi.number().min(1).max(10).default(3),
    MAX_QUEUE_SIZE: Joi.number().min(1).default(50),
    QUEUE_TIMEOUT: Joi.number().default(10 * 60 * 1000), // 10 min
    DOWNLOAD_TIMEOUT: Joi.number().default(60 * 1000), // 60 sec

    // Performance
    WORKER_SPAWN_DELAY: Joi.number().default(1000),
    QUEUE_POLL_INTERVAL: Joi.number().default(2000),
    MEMORY_LOG_INTERVAL: Joi.number().default(30000),
    AUTO_CLEANUP_INTERVAL: Joi.number().default(5 * 60 * 1000), // 5 min

    // Features
    MEMORY_PROCESSING: Joi.boolean().default(true),
    AUTO_MEMORY_CLEANUP: Joi.boolean().default(true),
    DEBUG_MEMORY: Joi.boolean().default(false),
    MEMORY_WARNING_THRESHOLD: Joi.number().min(50).max(95).default(80),

    // WebSocket settings
    WEBSOCKET_ENABLED: Joi.boolean().default(true),
    WEBSOCKET_PATH: Joi.string().default('/ws'),
    WEBSOCKET_PING_TIMEOUT: Joi.number().default(60000),
    WEBSOCKET_PING_INTERVAL: Joi.number().default(25000)
});

// Load and validate configuration
function loadConfig() {
    const rawConfig = {
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
        BOT_TOKEN: process.env.BOT_TOKEN,
        CHANNEL_ID: process.env.CHANNEL_ID,
        MAX_MEMORY_PER_VIDEO: process.env.MAX_MEMORY_PER_VIDEO,
        MAX_TOTAL_MEMORY: process.env.MAX_TOTAL_MEMORY,
        MAX_FILE_SIZE: process.env.MAX_FILE_SIZE,
        MAX_CONCURRENT_DOWNLOADS: process.env.MAX_CONCURRENT_DOWNLOADS,
        MAX_QUEUE_SIZE: process.env.MAX_QUEUE_SIZE,
        QUEUE_TIMEOUT: process.env.QUEUE_TIMEOUT,
        DOWNLOAD_TIMEOUT: process.env.DOWNLOAD_TIMEOUT,
        WORKER_SPAWN_DELAY: process.env.WORKER_SPAWN_DELAY,
        QUEUE_POLL_INTERVAL: process.env.QUEUE_POLL_INTERVAL,
        MEMORY_LOG_INTERVAL: process.env.MEMORY_LOG_INTERVAL,
        AUTO_CLEANUP_INTERVAL: process.env.AUTO_CLEANUP_INTERVAL,
        MEMORY_PROCESSING: process.env.MEMORY_PROCESSING,
        AUTO_MEMORY_CLEANUP: process.env.AUTO_MEMORY_CLEANUP,
        DEBUG_MEMORY: process.env.DEBUG_MEMORY,
        MEMORY_WARNING_THRESHOLD: process.env.MEMORY_WARNING_THRESHOLD,
        WEBSOCKET_ENABLED: process.env.WEBSOCKET_ENABLED,
        WEBSOCKET_PATH: process.env.WEBSOCKET_PATH,
        WEBSOCKET_PING_TIMEOUT: process.env.WEBSOCKET_PING_TIMEOUT,
        WEBSOCKET_PING_INTERVAL: process.env.WEBSOCKET_PING_INTERVAL
    };

    const { error, value } = configSchema.validate(rawConfig, {
        allowUnknown: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        throw new Error(`Config validation error: ${error.details[0].message}`);
    }

    return value;
}

const config = loadConfig();

// Derived configuration
config.SUPPORTED_DOMAINS = ['instagram.com', 'www.instagram.com'];

module.exports = config;
