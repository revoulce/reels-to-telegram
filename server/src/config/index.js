const Joi = require('joi');

// Configuration schema validation
const configSchema = Joi.object({
    PORT: Joi.number().default(3000),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('production'),

    // Telegram
    BOT_TOKEN: Joi.string().required(),
    CHANNEL_ID: Joi.string().required(),

    // Security
    API_KEY: Joi.string().min(32).required(),
    JWT_SECRET: Joi.string().min(32).optional(),
    JWT_EXPIRY: Joi.string().default('24h'),

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
    WEBSOCKET_PING_INTERVAL: Joi.number().default(25000),

    // Rate limiting
    RATE_LIMITING_ENABLED: Joi.boolean().default(true),
    RATE_LIMIT_WINDOW: Joi.number().default(15 * 60 * 1000), // 15 minutes
    RATE_LIMIT_MAX: Joi.number().default(500),
    API_RATE_LIMIT_WINDOW: Joi.number().default(60 * 1000), // 1 minute
    API_RATE_LIMIT_MAX: Joi.number().default(150),
    DOWNLOAD_RATE_LIMIT_WINDOW: Joi.number().default(60 * 1000), // 1 minute
    DOWNLOAD_RATE_LIMIT_MAX: Joi.number().default(20)
});

// Load and validate configuration
function loadConfig() {
    const rawConfig = {
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
        BOT_TOKEN: process.env.BOT_TOKEN,
        CHANNEL_ID: process.env.CHANNEL_ID,
        API_KEY: process.env.API_KEY,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRY: process.env.JWT_EXPIRY,
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
        WEBSOCKET_PING_INTERVAL: process.env.WEBSOCKET_PING_INTERVAL,
        RATE_LIMITING_ENABLED: process.env.RATE_LIMITING_ENABLED,
        RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW,
        RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
        API_RATE_LIMIT_WINDOW: process.env.API_RATE_LIMIT_WINDOW,
        API_RATE_LIMIT_MAX: process.env.API_RATE_LIMIT_MAX,
        DOWNLOAD_RATE_LIMIT_WINDOW: process.env.DOWNLOAD_RATE_LIMIT_WINDOW,
        DOWNLOAD_RATE_LIMIT_MAX: process.env.DOWNLOAD_RATE_LIMIT_MAX
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

// Use API_KEY as JWT_SECRET if not provided
if (!config.JWT_SECRET) {
    config.JWT_SECRET = config.API_KEY;
}

module.exports = config;