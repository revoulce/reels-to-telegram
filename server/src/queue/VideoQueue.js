const { EventEmitter } = require('events');
const config = require('../config');
const JobManager = require('./JobManager');
const MemoryManager = require('./MemoryManager');
const VideoProcessor = require('../processors/VideoProcessor');
const TelegramService = require('../services/TelegramService');

/**
 * VideoQueue - Main coordinator for video processing pipeline with WebSocket support
 */
class VideoQueue extends EventEmitter {
    constructor(webSocketService = null) {
        super();

        // Initialize components
        this.jobManager = new JobManager();
        this.memoryManager = new MemoryManager();
        this.videoProcessor = new VideoProcessor(this.memoryManager);
        this.telegramService = new TelegramService();
        this.webSocketService = webSocketService;

        // Worker management
        this.activeWorkers = 0;

        // Setup component event forwarding
        this.setupEventForwarding();

        // Setup Telegram bot commands
        this.telegramService.setupStatsCommands(
            () => this.getQueueStats(),
            () => this.memoryManager.getStats()
        );

        // Setup periodic stats broadcasting
        if (this.webSocketService) {
            this.setupWebSocketBroadcasting();
        }

        console.log(`🚀 VideoQueue initialized with ${webSocketService ? 'WebSocket' : 'polling'} support`);
    }

    /**
     * Add job to processing queue
     * @param {object} videoData
     * @param {object} userInfo
     * @returns {string} jobId
     */
    addJob(videoData, userInfo = {}) {
        const jobId = this.jobManager.addJob(videoData, userInfo);

        // Start processing if workers available
        setImmediate(() => this.processNext());

        return jobId;
    }

    /**
     * Process next job in queue
     */
    async processNext() {
        // Check worker availability
        if (this.activeWorkers >= config.MAX_CONCURRENT_DOWNLOADS) {
            return;
        }

        // Get next job
        const job = this.jobManager.getNextJob();
        if (!job) {
            return;
        }

        this.activeWorkers++;

        console.log(`🚀 Processing job ${job.id.substring(0, 8)} (worker ${this.activeWorkers}/${config.MAX_CONCURRENT_DOWNLOADS})`);

        try {
            const result = await this.processJob(job);
            this.jobManager.completeJob(job.id, result);
        } catch (error) {
            this.jobManager.failJob(job.id, error);
        } finally {
            this.activeWorkers--;

            // Process next job with delay
            setTimeout(() => this.processNext(), config.WORKER_SPAWN_DELAY);
        }
    }

    /**
     * Process individual job
     * @param {object} job
     * @returns {Promise<object>}
     */
    async processJob(job) {
        const { videoData } = job;
        const { pageUrl } = videoData;
        const startTime = Date.now();

        let videoBuffer = null;
        let processResult = null;

        try {
            // Step 1-2: Download video and extract metadata (10% -> 70%)
            const progressCallback = (progress, message) => {
                this.jobManager.updateJobProgress(job.id, progress, message);
            };

            processResult = await this.videoProcessor.processVideo(pageUrl, job.id, progressCallback);
            videoBuffer = processResult.buffer;
            const metadata = processResult.metadata;

            // Step 3: Send to Telegram (80% -> 100%)
            this.jobManager.updateJobProgress(job.id, 80, 'Sending to Telegram...');

            const telegramResult = await this.telegramService.sendVideo(
                videoBuffer,
                metadata,
                pageUrl,
                job.id
            );

            this.jobManager.updateJobProgress(job.id, 100, 'Completed successfully');

            const processingTime = Date.now() - startTime;

            return {
                success: true,
                message: 'Video processed successfully in memory',
                processingTime,
                metadata: {
                    author: metadata.author || 'Unknown',
                    title: metadata.title || 'Instagram Video',
                    views: metadata.view_count,
                    likes: metadata.like_count,
                    duration: metadata.duration,
                    fileSize: processResult?.size
                },
                telegramMessageId: telegramResult.message_id,
                memoryProcessing: true
            };

        } finally {
            // Always cleanup memory
            this.videoProcessor.cleanup(job.id);

            // Explicit cleanup hint for large objects
            if (videoBuffer && processResult?.size > 10 * 1024 * 1024) {
                videoBuffer = null;
                if (global.gc) {
                    global.gc();
                }
            }
        }
    }

    /**
     * Cancel job (only if in queue)
     * @param {string} jobId
     * @returns {boolean}
     */
    cancelJob(jobId) {
        return this.jobManager.cancelJob(jobId);
    }

    /**
     * Get job status
     * @param {string} jobId
     * @returns {object|null}
     */
    getJobStatus(jobId) {
        return this.jobManager.getJobStatus(jobId);
    }

    /**
     * Get combined queue statistics including WebSocket info
     * @returns {object}
     */
    getQueueStats() {
        const jobStats = this.jobManager.getStats();
        const memoryStats = this.memoryManager.getStats();

        const stats = {
            // Job statistics
            ...jobStats,
            activeWorkers: this.activeWorkers,
            maxWorkers: config.MAX_CONCURRENT_DOWNLOADS,

            // Memory statistics
            memoryUsage: memoryStats.current,
            memoryUsageFormatted: memoryStats.currentFormatted,
            maxMemory: memoryStats.max,
            maxMemoryFormatted: memoryStats.maxFormatted,
            memoryUtilization: memoryStats.utilization,
            peakMemoryUsage: memoryStats.peak,
            peakMemoryFormatted: memoryStats.peakFormatted,

            // Configuration
            memoryProcessing: config.MEMORY_PROCESSING,
            autoCleanup: config.AUTO_MEMORY_CLEANUP
        };

        // Add WebSocket statistics if available
        if (this.webSocketService) {
            stats.webSocket = this.webSocketService.getStats();
            stats.realTimeUpdates = true;
        } else {
            stats.realTimeUpdates = false;
        }

        return stats;
    }

    /**
     * Get all jobs with pagination
     * @param {number} limit
     * @param {number} offset
     * @returns {object}
     */
    getAllJobs(limit, offset) {
        return this.jobManager.getAllJobs(limit, offset);
    }

    /**
     * Setup event forwarding from components
     */
    setupEventForwarding() {
        // Forward job events
        this.jobManager.on('jobAdded', (job) => {
            this.emit('jobAdded', job);
            // Real-time notification via WebSocket
            if (this.webSocketService) {
                this.webSocketService.broadcastQueueStats(this.getQueueStats());
            }
        });

        this.jobManager.on('jobStarted', (job) => this.emit('jobStarted', job));

        this.jobManager.on('jobProgress', (jobId, progress, message) => {
            this.emit('jobProgress', jobId, progress, message);
            // Real-time progress via WebSocket
            if (this.webSocketService) {
                this.webSocketService.broadcastJobProgress(jobId, progress, message);
            }
        });

        this.jobManager.on('jobCompleted', (jobId, result) => {
            this.emit('jobCompleted', jobId, result);
            // Real-time completion via WebSocket
            if (this.webSocketService) {
                this.webSocketService.broadcastJobFinished(jobId, 'completed', result);
                this.webSocketService.broadcastQueueStats(this.getQueueStats());
            }
        });

        this.jobManager.on('jobFailed', (jobId, error) => {
            this.emit('jobFailed', jobId, error);
            // Real-time failure via WebSocket
            if (this.webSocketService) {
                this.webSocketService.broadcastJobFinished(jobId, 'failed', null, error.message);
                this.webSocketService.broadcastQueueStats(this.getQueueStats());
            }
        });

        this.jobManager.on('jobCancelled', (jobId) => {
            this.emit('jobCancelled', jobId);
            // Real-time cancellation via WebSocket
            if (this.webSocketService) {
                this.webSocketService.broadcastJobFinished(jobId, 'cancelled');
                this.webSocketService.broadcastQueueStats(this.getQueueStats());
            }
        });

        // Forward memory events
        this.memoryManager.on('memoryAllocated', (jobId, bytes, total) => {
            this.emit('memoryAllocated', jobId, bytes, total);
            // Broadcast memory stats if significant change
            if (this.webSocketService && bytes > 10 * 1024 * 1024) { // > 10MB
                this.webSocketService.broadcastMemoryStats(this.memoryManager.getStats());
            }
        });

        this.memoryManager.on('memoryFreed', (jobId, bytes, total) => {
            this.emit('memoryFreed', jobId, bytes, total);
            // Broadcast memory stats if significant change
            if (this.webSocketService && bytes > 10 * 1024 * 1024) { // > 10MB
                this.webSocketService.broadcastMemoryStats(this.memoryManager.getStats());
            }
        });

        this.memoryManager.on('memoryCleanup', (freed) => {
            this.emit('memoryCleanup', freed);
            if (this.webSocketService) {
                this.webSocketService.broadcastMemoryStats(this.memoryManager.getStats());
            }
        });
    }

    /**
     * Setup periodic WebSocket broadcasting
     */
    setupWebSocketBroadcasting() {
        // Broadcast queue stats every 30 seconds
        setInterval(() => {
            if (this.webSocketService && this.webSocketService.connectedClients.size > 0) {
                this.webSocketService.broadcastQueueStats(this.getQueueStats());
            }
        }, 30000);

        // Broadcast memory stats every 60 seconds
        setInterval(() => {
            if (this.webSocketService && this.webSocketService.connectedClients.size > 0) {
                this.webSocketService.broadcastMemoryStats(this.memoryManager.getStats());
            }
        }, 60000);
    }

    /**
     * Start Telegram bot
     */
    async launch() {
        await this.telegramService.launch();
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('🔄 VideoQueue shutting down...');

        // Stop accepting new jobs
        console.log('🚫 Stopping new job acceptance...');

        // Notify WebSocket clients about shutdown
        if (this.webSocketService) {
            await this.webSocketService.shutdown();
        }

        // Wait for active workers to complete
        if (this.activeWorkers > 0) {
            console.log(`⏳ Waiting for ${this.activeWorkers} active workers to complete...`);

            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.activeWorkers === 0) {
                        clearInterval(checkInterval);
                        console.log('✅ All workers completed');
                        this.telegramService.stop('SIGTERM');
                        resolve();
                    }
                }, 1000);

                // Force shutdown after 30 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    console.log('⏰ Force shutdown after timeout');
                    this.telegramService.stop('SIGTERM');
                    resolve();
                }, 30000);
            });
        } else {
            this.telegramService.stop('SIGTERM');
        }
    }
}

module.exports = VideoQueue;