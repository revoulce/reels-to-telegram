const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const VideoProcessor = require('../processors/VideoProcessor');
const VideoService = require('../services/VideoService');

/**
 * Simplified Video Queue with built-in memory management
 */
class VideoQueue extends EventEmitter {
    constructor(webSocketService = null) {
        super();

        // Initialize components
        this.videoProcessor = new VideoProcessor();
        this.videoService = new VideoService(this);
        this.webSocketService = webSocketService;

        // Queue state
        this.queue = new Map();        // Pending jobs
        this.processing = new Map();   // Active jobs
        this.completed = new Map();    // Completed jobs
        this.failed = new Map();       // Failed jobs

        // Memory tracking
        this.memoryUsage = 0;
        this.peakMemoryUsage = 0;

        // Statistics
        this.totalProcessed = 0;
        this.startTime = Date.now();
        this.activeWorkers = 0;

        // Setup periodic cleanup
        this.setupCleanup();

        console.log('🚀 VideoQueue initialized');
    }

    /**
     * Add job to processing queue
     */
    addJob(videoData, userInfo = {}) {
        // Check queue capacity
        if (this.queue.size >= config.MAX_QUEUE_SIZE) {
            throw new Error(`Queue is full (${this.queue.size}/${config.MAX_QUEUE_SIZE}). Please try again later.`);
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
        const [jobId, job] = this.queue.entries().next().value;
        if (!job) return;

        this.queue.delete(jobId);
        this.activeWorkers++;

        // Move to processing
        const processingJob = {
            ...job,
            status: 'processing',
            startedAt: new Date()
        };
        this.processing.set(jobId, processingJob);
        this.emit('jobStarted', processingJob);

        console.log(`🚀 Processing job ${jobId.substring(0, 8)} (worker ${this.activeWorkers}/${config.MAX_CONCURRENT_DOWNLOADS})`);

        try {
            const result = await this.processJob(processingJob);
            this.completeJob(jobId, result);
        } catch (error) {
            this.failJob(jobId, error);
        } finally {
            this.activeWorkers--;
            setTimeout(() => this.processNext(), config.WORKER_SPAWN_DELAY);
        }
    }

    /**
     * Process individual job
     */
    async processJob(job) {
        const { videoData } = job;
        const { pageUrl } = videoData;
        const startTime = Date.now();

        try {
            // Download and process video
            const progressCallback = (progress, message) => {
                job.progress = progress;
                job.progressMessage = message;
                job.lastUpdated = new Date();
                this.emit('jobProgress', job.id, progress, message);
            };

            const processResult = await this.videoProcessor.processVideo(pageUrl, job.id, progressCallback);

            // Send to Telegram
            job.progress = 80;
            job.progressMessage = 'Sending to Telegram...';
            this.emit('jobProgress', job.id, 80, 'Sending to Telegram...');

            const telegramResult = await this.videoService.sendVideo(
                processResult.buffer,
                processResult.metadata,
                pageUrl,
                job.id
            );

            job.progress = 100;
            job.progressMessage = 'Completed successfully';
            this.emit('jobProgress', job.id, 100, 'Completed successfully');

            const processingTime = Date.now() - startTime;

            return {
                success: true,
                message: 'Video processed successfully',
                processingTime,
                metadata: {
                    author: processResult.metadata.author || 'Unknown',
                    title: processResult.metadata.title || 'Instagram Video',
                    views: processResult.metadata.view_count,
                    likes: processResult.metadata.like_count,
                    duration: processResult.metadata.duration,
                    fileSize: processResult.size
                },
                telegramMessageId: telegramResult.message_id
            };

        } finally {
            // Cleanup
            this.videoProcessor.cleanup(job.id);
            if (global.gc) global.gc();
        }
    }

    /**
     * Mark job as completed
     */
    completeJob(jobId, result) {
        const job = this.processing.get(jobId);
        if (!job) return;

        this.processing.delete(jobId);

        const completedJob = {
            ...job,
            status: 'completed',
            result,
            completedAt: new Date()
        };

        this.completed.set(jobId, completedJob);
        this.totalProcessed++;

        this.emit('jobCompleted', jobId, result);
        console.log(`✅ Job ${jobId.substring(0, 8)} completed`);
    }

    /**
     * Mark job as failed
     */
    failJob(jobId, error) {
        const job = this.processing.get(jobId);
        if (!job) return;

        this.processing.delete(jobId);

        const failedJob = {
            ...job,
            status: 'failed',
            error: error.message,
            failedAt: new Date()
        };

        this.failed.set(jobId, failedJob);

        this.emit('jobFailed', jobId, error);
        console.error(`❌ Job ${jobId.substring(0, 8)} failed: ${error.message}`);
    }

    /**
     * Cancel job (only if in queue)
     */
    cancelJob(jobId) {
        if (this.queue.has(jobId)) {
            this.queue.delete(jobId);
            this.emit('jobCancelled', jobId);
            console.log(`❌ Job ${jobId.substring(0, 8)} cancelled`);
            return true;
        }
        return false;
    }

    /**
     * Get job status
     */
    getJobStatus(jobId) {
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
        return null;
    }

    /**
     * Get queue statistics
     */
    getQueueStats() {
        const uptime = Date.now() - this.startTime;
        const throughput = this.totalProcessed > 0 ?
            (this.totalProcessed / (uptime / 1000 / 60)) : 0; // per minute

        const stats = {
            queued: this.queue.size,
            processing: this.processing.size,
            completed: this.completed.size,
            failed: this.failed.size,
            totalProcessed: this.totalProcessed,
            maxQueueSize: config.MAX_QUEUE_SIZE,
            uptime: Math.round(uptime / 1000),
            throughputPerMinute: Math.round(throughput * 100) / 100,
            activeWorkers: this.activeWorkers,
            maxWorkers: config.MAX_CONCURRENT_DOWNLOADS
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
     * Setup periodic cleanup
     */
    setupCleanup() {
        // Clean old completed/failed jobs every 5 minutes
        setInterval(() => {
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours

            // Clean completed jobs
            for (const [jobId, job] of this.completed.entries()) {
                if (now - job.completedAt > maxAge) {
                    this.completed.delete(jobId);
                }
            }

            // Clean failed jobs
            for (const [jobId, job] of this.failed.entries()) {
                if (now - job.failedAt > maxAge) {
                    this.failed.delete(jobId);
                }
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Launch the queue
     */
    async launch() {
        await this.videoService.launch();
        console.log('🚀 VideoQueue launched');
    }

    /**
     * Shutdown the queue
     */
    async shutdown() {
        this.videoService.stop();
        console.log('🛑 VideoQueue shutdown');
    }
}

module.exports = VideoQueue;
