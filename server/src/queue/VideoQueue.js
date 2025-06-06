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
        if (this.queue.size === 0) {
            return;
        }

        const entries = this.queue.entries();
        const firstEntry = entries.next();

        if (firstEntry.done) {
            return;
        }

        const [jobId, job] = firstEntry.value;

        try {
            // Update job status
            job.status = 'processing';
            job.startedAt = new Date();

            // Process the job
            await this.processJob(jobId, job);

            // Complete the job
            await this.completeJob(jobId);

        } catch (error) {
            console.error(`Error processing job ${jobId}:`, error);
            await this.failJob(jobId, error.message);
        }
    }

    /**
     * Process individual job
     */
    async processJob(jobId, job) {
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
        const stats = {
            queued: this.queue.size,
            processing: this.processing.size,
            completed: this.completed.size,
            failed: this.failed.size,
            activeWorkers: this.activeWorkers,
            maxWorkers: config.MAX_CONCURRENT_DOWNLOADS,
            maxQueueSize: config.MAX_QUEUE_SIZE,
            totalProcessed: this.completed.size + this.failed.size,
            throughputPerMinute: this.calculateThroughput(),
            uptime: this.getUptime(),
            memoryUsage: process.memoryUsage().heapUsed,
            webSocket: this.webSocketService ? this.webSocketService.getStats() : null,
            realTimeUpdates: !!this.webSocketService
        };

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

    /**
     * Calculate throughput (jobs per minute)
     */
    calculateThroughput() {
        const uptime = this.getUptime();
        const totalProcessed = this.completed.size + this.failed.size;
        return totalProcessed > 0 ? Math.round((totalProcessed / (uptime / 60)) * 100) / 100 : 0;
    }

    /**
     * Get uptime in seconds
     */
    getUptime() {
        return Math.round((Date.now() - this.startTime) / 1000);
    }
}

module.exports = VideoQueue;
