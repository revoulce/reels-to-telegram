const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { promisify } = require('util');
const { exec } = require('child_process');

// Configuration and utilities
const config = require('./config');

// Services
const WebSocketService = require('./services/WebSocketService');
const AuthService = require('./services/AuthService');
const VideoService = require('./services/VideoService');

// Middleware
const { requestLogger, errorLogger } = require('./middleware/logging');
const { generalRateLimit, apiRateLimit, downloadRateLimit } = require('./middleware/rateLimiting');

// Core components
const VideoQueue = require('./queue/VideoQueue');

// Controllers
const StatsController = require('./controllers/StatsController');

// Validation utilities
const { validateVideoData } = require('./utils/validation');

const execAsync = promisify(exec);

/**
 * Main Server Class with WebSocket and JWT support
 */
class Server {
    constructor() {
        this.app = express();
        this.httpServer = createServer(this.app);

        // Services
        this.webSocketService = null;
        this.authService = null;
        this.videoService = null;
        this.videoQueue = null;

        // Controllers
        this.statsController = null;

        this.setupExpress();
    }

    /**
     * Setup Express app with middleware
     */
    setupExpress() {
        // CORS configuration
        this.app.use(cors({
            origin: [
                'https://www.instagram.com',
                'chrome-extension://*'
            ],
            credentials: true
        }));

        // General rate limiting
        this.app.use(generalRateLimit);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));

        // Request logging
        this.app.use(requestLogger);

        console.log('⚙️ Express middleware configured');
    }

    /**
     * Setup API routes with enhanced security
     */
    setupRoutes() {
        // Health endpoints (no auth required)
        this.app.get('/health', (req, res) => this.statsController.getHealth(req, res));
        this.app.get('/api/health', (req, res) => this.statsController.getApiHealth(req, res));

        // Authenticated API routes
        const apiRouter = express.Router();

        // Apply API rate limiting
        apiRouter.use(apiRateLimit);

        // API key authentication
        apiRouter.use(this.authService.createAuthMiddleware());

        // Video processing endpoints
        apiRouter.post('/download-video',
            downloadRateLimit,
            (req, res) => {
                // Validate request body
                try {
                    validateVideoData(req.body);
                } catch (error) {
                    return res.status(400).json({
                        success: false,
                        error: error.message
                    });
                }

                this.videoService.downloadVideo(req, res);
            }
        );

        apiRouter.get('/job/:jobId',
            (req, res) => this.videoService.getJobStatus(req, res)
        );

        apiRouter.delete('/job/:jobId',
            (req, res) => this.videoService.cancelJob(req, res)
        );

        // Statistics endpoints
        apiRouter.get('/queue/stats',
            (req, res) => this.statsController.getQueueStats(req, res)
        );

        apiRouter.get('/queue/jobs',
            (req, res) => this.statsController.getQueueJobs(req, res)
        );

        apiRouter.get('/stats',
            (req, res) => this.statsController.getStats(req, res)
        );

        // WebSocket statistics
        apiRouter.get('/websocket/stats',
            (req, res) => {
                const stats = this.webSocketService.getStats();
                res.json({ success: true, ...stats });
            }
        );

        // Rate limiting statistics
        apiRouter.get('/rate-limits',
            (req, res) => this.statsController.getRateLimitStats(req, res)
        );

        // Mount API router
        this.app.use('/api', apiRouter);

        // Error handling middleware
        this.app.use(errorLogger);

        console.log('🛣️ API routes configured with API key authentication');
    }

    /**
     * Initialize core components
     */
    async initializeComponents() {
        // Initialize authentication service
        this.authService = new AuthService();

        // Initialize WebSocket service
        this.webSocketService = new WebSocketService(this.httpServer);

        // Initialize video queue with WebSocket support
        this.videoQueue = new VideoQueue(this.webSocketService);

        // Initialize video service
        this.videoService = new VideoService(this.videoQueue);

        // Initialize stats controller
        this.statsController = new StatsController(this.videoQueue);

        // Setup event listeners
        this.setupEventListeners();

        console.log('🧩 Core components initialized with WebSocket and JWT support');
    }

    /**
     * Setup event listeners for monitoring
     */
    setupEventListeners() {
        this.videoQueue.on('jobAdded', (job) => {
            console.log(`📥 Job ${job.id.substring(0, 8)} added to queue`);
        });

        this.videoQueue.on('jobCompleted', (jobId, result) => {
            console.log(`✅ Job ${jobId.substring(0, 8)} completed in ${result.processingTime}ms`);
        });

        this.videoQueue.on('jobFailed', (jobId, error) => {
            console.error(`❌ Job ${jobId.substring(0, 8)} failed: ${error.message}`);
        });

        this.videoQueue.on('memoryAllocated', (jobId, bytes, total) => {
            if (config.DEBUG_MEMORY) {
                console.log(`💾 Memory allocated for ${jobId.substring(0, 8)}: ${this.formatMemory(bytes)} (total: ${this.formatMemory(total)})`);
            }
        });

        this.videoQueue.on('memoryFreed', (jobId, bytes, total) => {
            if (config.DEBUG_MEMORY) {
                console.log(`💾 Memory freed for ${jobId.substring(0, 8)}: ${this.formatMemory(bytes)} (total: ${this.formatMemory(total)})`);
            }
        });

        // WebSocket connection events
        if (this.webSocketService) {
            // Log WebSocket connections for monitoring
            setInterval(() => {
                const wsStats = this.webSocketService.getStats();
                if (wsStats.totalConnections > 0) {
                    console.log(`🔌 WebSocket: ${wsStats.totalConnections} connections, ${wsStats.totalJobSubscriptions} job subscriptions`);
                }
            }, 5 * 60 * 1000); // Every 5 minutes
        }
    }

    /**
     * Validate dependencies
     */
    async validateDependencies() {
        try {
            await execAsync('yt-dlp --version');
            console.log('✅ yt-dlp found');
        } catch (error) {
            throw new Error('yt-dlp not found. Install with: pip install yt-dlp');
        }
    }

    /**
     * Start the server
     */
    async start() {
        try {
            // Validate dependencies
            await this.validateDependencies();

            // Initialize components
            await this.initializeComponents();

            // Setup routes
            this.setupRoutes();

            // Start HTTP + WebSocket server
            this.httpServer.listen(config.PORT, () => {
                console.log(`🚀 Server running on port ${config.PORT} with IN-MEMORY processing`);
                console.log(`📺 Telegram channel: ${config.CHANNEL_ID}`);
                console.log(`⚡ Queue: max ${config.MAX_CONCURRENT_DOWNLOADS} concurrent, ${config.MAX_QUEUE_SIZE} queue size`);
                console.log(`💾 Memory limits: ${this.formatMemory(config.MAX_MEMORY_PER_VIDEO)} per video, ${this.formatMemory(config.MAX_TOTAL_MEMORY)} total`);
                console.log(`🔌 WebSocket: Real-time updates enabled at /ws`);
                console.log(`🔐 JWT Authentication: Enhanced security enabled`);
                console.log(`🛡️ Rate limiting: ${config.RATE_LIMITING_ENABLED ? 'enabled' : 'disabled (local mode)'}`);
                console.log(`🚀 Zero disk usage mode enabled!`);
                console.log(`🔧 Debug memory: ${config.DEBUG_MEMORY ? 'enabled' : 'disabled'}`);
                console.log('');
                console.log('📖 API Documentation:');
                console.log(`   Health: http://localhost:${config.PORT}/health`);
                console.log(`   Auth:   POST http://localhost:${config.PORT}/api/auth/token`);
                console.log(`   WebSocket: ws://localhost:${config.PORT}/ws`);
            });

            // Start Telegram bot
            await this.videoQueue.launch();

            // Log system information
            this.logSystemInfo();

            // Setup graceful shutdown
            this.setupGracefulShutdown();

        } catch (error) {
            console.error('❌ Failed to start server:', error.message);

            if (error.message.includes('yt-dlp')) {
                console.log('\n💡 Install yt-dlp:');
                console.log('   pip install yt-dlp');
                console.log('   # or');
                console.log('   brew install yt-dlp  # macOS');
                console.log('   # or');
                console.log('   sudo apt install yt-dlp  # Ubuntu/Debian');
            }

            process.exit(1);
        }
    }

    /**
     * Log system information
     */
    logSystemInfo() {
        const os = require('os');
        const systemMem = os.totalmem();
        const freeMem = os.freemem();

        console.log(`💻 System: ${this.formatMemory(freeMem)} free / ${this.formatMemory(systemMem)} total RAM`);

        if (freeMem < config.MAX_TOTAL_MEMORY * 2) {
            console.warn(`⚠️ Warning: Low system memory. Consider reducing MAX_TOTAL_MEMORY.`);
        }
    }

    /**
     * Setup graceful shutdown handling
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);

            try {
                if (this.videoQueue) {
                    const memoryStats = this.videoQueue.memoryManager.getStats();
                    const queueStats = this.videoQueue.getQueueStats();

                    console.log(`💾 Memory at shutdown: ${memoryStats.currentFormatted}`);
                    console.log(`📊 Total processed: ${queueStats.totalProcessed}`);

                    await this.videoQueue.shutdown();
                }

                console.log('✅ Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
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
}

// Create and start server
const server = new Server();
server.start();
