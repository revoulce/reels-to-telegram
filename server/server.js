const express = require('express');
const cors = require('cors');
const {Telegraf} = require('telegraf');
const {v4: uuidv4} = require('uuid');
const {exec, spawn} = require('child_process');
const {promisify} = require('util');
const EventEmitter = require('events');
const os = require('os');

const execAsync = promisify(exec);

/**
 * Configuration with memory processing support
 */
const config = {
    PORT: process.env.PORT || 3000,
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN',
    CHANNEL_ID: process.env.CHANNEL_ID || '@your_channel',
    API_KEY: process.env.API_KEY || 'your-secret-api-key',

    // File size limits (for validation, not storage)
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,
    DOWNLOAD_TIMEOUT: parseInt(process.env.DOWNLOAD_TIMEOUT) || 60000,

    // Memory processing configuration
    MAX_MEMORY_PER_VIDEO: parseInt(process.env.MAX_MEMORY_PER_VIDEO) || 50 * 1024 * 1024,
    MAX_TOTAL_MEMORY: parseInt(process.env.MAX_TOTAL_MEMORY) || 200 * 1024 * 1024,
    MEMORY_PROCESSING: process.env.MEMORY_PROCESSING !== 'false',
    AUTO_MEMORY_CLEANUP: process.env.AUTO_MEMORY_CLEANUP !== 'false',
    MEMORY_WARNING_THRESHOLD: parseInt(process.env.MEMORY_WARNING_THRESHOLD) || 80,

    // Queue configuration
    MAX_CONCURRENT_DOWNLOADS: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS) || 3,
    MAX_QUEUE_SIZE: parseInt(process.env.MAX_QUEUE_SIZE) || 50,
    QUEUE_TIMEOUT: parseInt(process.env.QUEUE_TIMEOUT) || 10 * 60 * 1000,

    // Performance settings
    WORKER_SPAWN_DELAY: parseInt(process.env.WORKER_SPAWN_DELAY) || 1000,
    QUEUE_POLL_INTERVAL: parseInt(process.env.QUEUE_POLL_INTERVAL) || 2000,
    MEMORY_LOG_INTERVAL: parseInt(process.env.MEMORY_LOG_INTERVAL) || 30000,

    // Validation
    SUPPORTED_DOMAINS: ['instagram.com', 'www.instagram.com'],

    // Debug options
    DEBUG_MEMORY: process.env.DEBUG_MEMORY === 'true'
};

// Application initialization
const app = express();
const bot = new Telegraf(config.BOT_TOKEN);

/**
 * Enhanced VideoQueue with memory processing capabilities
 * Implements zero-disk usage pattern with comprehensive memory management
 */
class VideoQueue extends EventEmitter {
    constructor() {
        super();

        // Queue state management
        this.queue = new Map();
        this.processing = new Map();
        this.completed = new Map();
        this.failed = new Map();

        // Resource tracking
        this.activeWorkers = 0;
        this.memoryUsage = 0;
        this.peakMemoryUsage = 0;
        this.totalProcessed = 0;
        this.startTime = Date.now();

        // Initialize cleanup and monitoring
        this.initializeCleanupScheduler();
        this.initializeMemoryMonitoring();

        console.log(`🚀 VideoQueue initialized with memory processing`);
        console.log(`💾 Memory limits: ${this.formatMemory(config.MAX_MEMORY_PER_VIDEO)} per video, ${this.formatMemory(config.MAX_TOTAL_MEMORY)} total`);
    }

    /**
     * Add job to processing queue with memory validation
     */
    addJob(videoData, userInfo = {}) {
        this.validateQueueCapacity();
        this.validateMemoryCapacity();

        const jobId = uuidv4();
        const job = {
            id: jobId,
            videoData,
            userInfo,
            addedAt: new Date(),
            status: 'queued',
            progress: 0,
            estimatedSize: this.estimateVideoSize(videoData.pageUrl)
        };

        this.queue.set(jobId, job);
        this.emit('jobAdded', job);

        console.log(`📥 Job ${jobId.substring(0, 8)} added to memory queue (${this.queue.size} queued, ${this.formatMemory(this.memoryUsage)} used)`);

        // Process next job if workers available
        setImmediate(() => this.processNext());

        return jobId;
    }

    /**
     * Process next available job from queue
     */
    async processNext() {
        if (this.activeWorkers >= config.MAX_CONCURRENT_DOWNLOADS) {
            return;
        }

        if (this.queue.size === 0) {
            return;
        }

        const [jobId, job] = this.queue.entries().next().value;
        this.queue.delete(jobId);

        this.activeWorkers++;
        this.processing.set(jobId, {
            ...job,
            status: 'processing',
            startedAt: new Date(),
            workerId: `worker-${this.activeWorkers}`
        });

        console.log(`🚀 Processing job ${jobId.substring(0, 8)} in memory (worker ${this.activeWorkers}/${config.MAX_CONCURRENT_DOWNLOADS})`);

        try {
            const result = await this.processJobInMemory(job);
            this.handleJobCompletion(jobId, job, result);
        } catch (error) {
            this.handleJobFailure(jobId, job, error);
        } finally {
            this.processing.delete(jobId);
            this.activeWorkers--;

            // Process next job with delay to prevent overwhelming
            setTimeout(() => this.processNext(), config.WORKER_SPAWN_DELAY);
        }
    }

    /**
     * Core memory processing logic
     */
    async processJobInMemory(job) {
        const { videoData } = job;
        const { pageUrl } = videoData;
        const startTime = Date.now();

        let videoBuffer = null;
        let allocatedMemory = 0;

        try {
            // Step 1: Extract metadata
            this.updateJobProgress(job.id, 10, 'Extracting video metadata...');
            const metadata = await this.extractMetadata(pageUrl);

            // Step 2: Download video to memory
            this.updateJobProgress(job.id, 30, 'Downloading video to memory...');

            const downloadResult = await this.downloadVideoToMemory(pageUrl, job.id);
            videoBuffer = downloadResult.buffer;
            allocatedMemory = downloadResult.size;

            // Update memory tracking
            this.memoryUsage += allocatedMemory;
            this.peakMemoryUsage = Math.max(this.peakMemoryUsage, this.memoryUsage);

            this.logMemoryUsage(`Job ${job.id.substring(0, 8)} allocated ${this.formatMemory(allocatedMemory)}`);

            // Step 3: Send to Telegram
            this.updateJobProgress(job.id, 80, 'Sending to Telegram...');

            const telegramResult = await this.sendVideoToTelegram(videoBuffer, metadata, pageUrl, job.id);

            this.updateJobProgress(job.id, 100, 'Completed successfully');

            const processingTime = Date.now() - startTime;
            this.totalProcessed++;

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
                    fileSize: allocatedMemory
                },
                telegramMessageId: telegramResult.message_id,
                memoryProcessing: true,
                peakMemoryUsage: this.peakMemoryUsage
            };

        } finally {
            // Always free memory, even on error
            if (allocatedMemory > 0) {
                this.memoryUsage -= allocatedMemory;
                this.logMemoryUsage(`Job ${job.id.substring(0, 8)} freed ${this.formatMemory(allocatedMemory)}`);
            }

            // Explicit garbage collection hint for large objects
            if (videoBuffer && allocatedMemory > 10 * 1024 * 1024) { // > 10MB
                videoBuffer = null;
                if (global.gc) {
                    global.gc();
                }
            }
        }
    }

    /**
     * Download video directly to memory using yt-dlp streaming
     */
    async downloadVideoToMemory(pageUrl, jobId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                ytDlpProcess.kill('SIGKILL');
                reject(new Error('Download timeout exceeded'));
            }, config.DOWNLOAD_TIMEOUT);

            // Configure yt-dlp for memory streaming
            const ytDlpArgs = [
                '--cookies', 'cookies.txt',
                '--format', 'best[ext=mp4]/best',
                '--output', '-', // Stream to stdout
                '--no-playlist',
                '--max-filesize', config.MAX_FILE_SIZE.toString(),
                '--quiet',
                pageUrl
            ];

            const ytDlpProcess = spawn('yt-dlp', ytDlpArgs, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const chunks = [];
            let totalSize = 0;
            let lastProgressUpdate = 0;

            ytDlpProcess.stdout.on('data', (chunk) => {
                chunks.push(chunk);
                totalSize += chunk.length;

                // Memory limit validation
                if (totalSize > config.MAX_MEMORY_PER_VIDEO) {
                    ytDlpProcess.kill('SIGKILL');
                    reject(new Error(`Video too large: ${this.formatMemory(totalSize)} > ${this.formatMemory(config.MAX_MEMORY_PER_VIDEO)}`));
                    return;
                }

                // Total memory limit validation
                if (this.memoryUsage + totalSize > config.MAX_TOTAL_MEMORY) {
                    ytDlpProcess.kill('SIGKILL');
                    reject(new Error(`Memory limit would be exceeded: ${this.formatMemory(this.memoryUsage + totalSize)} > ${this.formatMemory(config.MAX_TOTAL_MEMORY)}`));
                    return;
                }

                // Progress updates (throttled)
                const now = Date.now();
                if (now - lastProgressUpdate > 1000) { // Every second
                    const progress = Math.min(30 + (totalSize / config.MAX_MEMORY_PER_VIDEO) * 40, 70);
                    this.updateJobProgress(jobId, Math.round(progress), `Downloaded ${this.formatMemory(totalSize)}...`);
                    lastProgressUpdate = now;
                }
            });

            ytDlpProcess.stderr.on('data', (data) => {
                if (config.DEBUG_MEMORY) {
                    console.log(`yt-dlp stderr [${jobId.substring(0, 8)}]:`, data.toString().trim());
                }
            });

            ytDlpProcess.on('close', (code) => {
                clearTimeout(timeout);

                if (code === 0 && chunks.length > 0) {
                    const videoBuffer = Buffer.concat(chunks);
                    console.log(`✅ Download completed: ${this.formatMemory(videoBuffer.length)} in memory`);
                    resolve({ buffer: videoBuffer, size: videoBuffer.length });
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });

            ytDlpProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`yt-dlp process error: ${error.message}`));
            });
        });
    }

    /**
     * Send video to Telegram from memory buffer
     */
    async sendVideoToTelegram(videoBuffer, metadata, pageUrl, jobId) {
        const caption = this.createCaption(metadata, pageUrl);

        try {
            const message = await bot.telegram.sendVideo(
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

            console.log(`📤 Video sent to Telegram: ${this.formatMemory(videoBuffer.length)} from memory`);
            return message;

        } catch (error) {
            console.error(`❌ Telegram send failed:`, error.message);
            throw new Error(`Failed to send to Telegram: ${error.message}`);
        }
    }

    /**
     * Extract video metadata using yt-dlp
     */
    async extractMetadata(pageUrl) {
        try {
            const command = `yt-dlp --dump-json --no-download --quiet "${pageUrl}"`;
            const { stdout } = await execAsync(command, {
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10
            });

            const metadata = JSON.parse(stdout);
            return {
                title: this.cleanText(metadata.title || metadata.description || ''),
                author: this.cleanText(metadata.uploader || metadata.channel || ''),
                duration: metadata.duration || 0,
                view_count: metadata.view_count || 0,
                like_count: metadata.like_count || 0,
                upload_date: metadata.upload_date || null,
                thumbnail: metadata.thumbnail || null
            };
        } catch (error) {
            console.warn(`⚠️ Metadata extraction failed: ${error.message}`);
            return {
                title: '',
                author: '',
                duration: 0,
                view_count: 0,
                like_count: 0
            };
        }
    }

    // Utility and validation methods
    validateQueueCapacity() {
        if (this.queue.size >= config.MAX_QUEUE_SIZE) {
            throw new Error(`Queue is full (${this.queue.size}/${config.MAX_QUEUE_SIZE}). Please try again later.`);
        }
    }

    validateMemoryCapacity() {
        const usagePercent = (this.memoryUsage / config.MAX_TOTAL_MEMORY) * 100;

        if (usagePercent > 95) {
            throw new Error(`Memory nearly exhausted (${usagePercent.toFixed(1)}%). Please try again later.`);
        }

        if (usagePercent > config.MEMORY_WARNING_THRESHOLD) {
            console.warn(`⚠️ High memory usage: ${usagePercent.toFixed(1)}%`);
        }
    }

    estimateVideoSize(pageUrl) {
        // Basic heuristic based on URL patterns
        if (pageUrl.includes('/reels/')) return 30 * 1024 * 1024; // 30MB
        if (pageUrl.includes('/stories/')) return 15 * 1024 * 1024; // 15MB
        return 25 * 1024 * 1024; // 25MB default
    }

    handleJobCompletion(jobId, job, result) {
        this.completed.set(jobId, {
            ...job,
            status: 'completed',
            result,
            completedAt: new Date()
        });

        this.emit('jobCompleted', jobId, result);
        console.log(`✅ Job ${jobId.substring(0, 8)} completed in ${result.processingTime}ms`);
    }

    handleJobFailure(jobId, job, error) {
        this.failed.set(jobId, {
            ...job,
            status: 'failed',
            error: error.message,
            failedAt: new Date()
        });

        this.emit('jobFailed', jobId, error);
        console.error(`❌ Job ${jobId.substring(0, 8)} failed: ${error.message}`);
    }

    updateJobProgress(jobId, progress, message) {
        const job = this.processing.get(jobId);
        if (job) {
            job.progress = progress;
            job.progressMessage = message;
            this.emit('jobProgress', jobId, progress, message);
        }
    }

    // Status and statistics methods
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

    getQueueStats() {
        const uptime = Date.now() - this.startTime;
        const throughput = this.totalProcessed > 0 ? (this.totalProcessed / (uptime / 1000 / 60)) : 0; // per minute

        return {
            // Queue metrics
            queued: this.queue.size,
            processing: this.processing.size,
            activeWorkers: this.activeWorkers,
            maxWorkers: config.MAX_CONCURRENT_DOWNLOADS,
            completed: this.completed.size,
            failed: this.failed.size,
            maxQueueSize: config.MAX_QUEUE_SIZE,

            // Memory metrics
            memoryUsage: this.memoryUsage,
            memoryUsageFormatted: this.formatMemory(this.memoryUsage),
            maxMemory: config.MAX_TOTAL_MEMORY,
            maxMemoryFormatted: this.formatMemory(config.MAX_TOTAL_MEMORY),
            memoryUtilization: Math.round((this.memoryUsage / config.MAX_TOTAL_MEMORY) * 100),
            peakMemoryUsage: this.peakMemoryUsage,
            peakMemoryFormatted: this.formatMemory(this.peakMemoryUsage),

            // Performance metrics
            totalProcessed: this.totalProcessed,
            uptime: Math.round(uptime / 1000),
            throughputPerMinute: Math.round(throughput * 100) / 100,

            // Configuration
            memoryProcessing: config.MEMORY_PROCESSING,
            autoCleanup: config.AUTO_MEMORY_CLEANUP
        };
    }

    cancelJob(jobId) {
        if (this.queue.has(jobId)) {
            this.queue.delete(jobId);
            console.log(`❌ Job ${jobId.substring(0, 8)} cancelled`);
            return true;
        }
        return false;
    }

    // Cleanup and monitoring
    initializeCleanupScheduler() {
        // Clean completed jobs every 5 minutes
        setInterval(() => this.cleanupCompletedJobs(), 5 * 60 * 1000);

        // System garbage collection hint every 10 minutes
        setInterval(() => {
            if (global.gc && this.memoryUsage === 0) {
                global.gc();
                console.log('🧹 Suggested garbage collection');
            }
        }, 10 * 60 * 1000);
    }

    initializeMemoryMonitoring() {
        if (config.MEMORY_LOG_INTERVAL > 0) {
            setInterval(() => this.logMemoryStatus(), config.MEMORY_LOG_INTERVAL);
        }
    }

    cleanupCompletedJobs() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        let cleaned = 0;

        for (const [jobId, job] of this.completed.entries()) {
            if (job.completedAt < oneHourAgo) {
                this.completed.delete(jobId);
                cleaned++;
            }
        }

        for (const [jobId, job] of this.failed.entries()) {
            if (job.failedAt < oneHourAgo) {
                this.failed.delete(jobId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old job records`);
        }
    }

    logMemoryUsage(context = '') {
        if (config.DEBUG_MEMORY && this.memoryUsage > 0) {
            const processMemory = process.memoryUsage();
            console.log(`💾 ${context} | Queue: ${this.formatMemory(this.memoryUsage)} | Process RSS: ${this.formatMemory(processMemory.rss)} | Heap: ${this.formatMemory(processMemory.heapUsed)}`);
        }
    }

    logMemoryStatus() {
        if (this.memoryUsage > 0 || this.processing.size > 0) {
            const stats = this.getQueueStats();
            console.log(`📊 Memory Status: ${stats.memoryUsageFormatted}/${stats.maxMemoryFormatted} (${stats.memoryUtilization}%) | Active: ${stats.processing} | Peak: ${stats.peakMemoryFormatted}`);
        }
    }

    // Utility methods
    formatMemory(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
    }

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
        caption += `\n💾 Processed in memory (zero disk usage)`;

        return caption.substring(0, 1024);
    }

    formatNumber(num) {
        if (!num || num === 0) return '';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }
}

// Initialize queue system
const videoQueue = new VideoQueue();

// Express middleware configuration
app.use(cors({
    origin: [
        'https://www.instagram.com',
        'chrome-extension://*'
    ],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Authentication middleware
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

// URL validation utility
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

// API Routes

// Health check with comprehensive memory information
app.get('/health', (req, res) => {
    const queueStats = videoQueue.getQueueStats();
    const processMemory = process.memoryUsage();
    const systemMemory = {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
    };

    res.json({
        status: 'OK',
        version: '3.0.0-memory',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            process: {
                rss: processMemory.rss,
                heapTotal: processMemory.heapTotal,
                heapUsed: processMemory.heapUsed,
                external: processMemory.external,
                rssFormatted: videoQueue.formatMemory(processMemory.rss),
                heapUsedFormatted: videoQueue.formatMemory(processMemory.heapUsed)
            },
            queue: {
                used: queueStats.memoryUsage,
                usedFormatted: queueStats.memoryUsageFormatted,
                max: queueStats.maxMemory,
                maxFormatted: queueStats.maxMemoryFormatted,
                utilization: queueStats.memoryUtilization,
                peak: queueStats.peakMemoryUsage,
                peakFormatted: queueStats.peakMemoryFormatted
            },
            system: {
                total: systemMemory.total,
                free: systemMemory.free,
                used: systemMemory.used,
                totalFormatted: videoQueue.formatMemory(systemMemory.total),
                freeFormatted: videoQueue.formatMemory(systemMemory.free),
                usedFormatted: videoQueue.formatMemory(systemMemory.used)
            }
        },
        queue: queueStats,
        features: {
            memoryProcessing: config.MEMORY_PROCESSING,
            zeroDiskUsage: true,
            autoCleanup: config.AUTO_MEMORY_CLEANUP,
            concurrentProcessing: true
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '3.0.0-memory',
        timestamp: new Date().toISOString(),
        queue: videoQueue.getQueueStats(),
        features: ['memory-processing', 'zero-disk-usage', 'concurrent-queue']
    });
});

// Main video processing endpoint
app.post('/api/download-video', authenticateApiKey, async (req, res) => {
    const { videoUrl, pageUrl, timestamp } = req.body;

    console.log('\n🚀 New video request for memory processing:', {
        pageUrl,
        hasVideoUrl: !!videoUrl,
        timestamp,
        currentMemory: videoQueue.formatMemory(videoQueue.memoryUsage)
    });

    // Input validation
    if (!pageUrl) {
        return res.status(400).json({
            success: false,
            error: 'pageUrl is required'
        });
    }

    if (!validateInstagramUrl(pageUrl)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid Instagram URL. Must be instagram.com with /reels/, /stories/, or /p/ path'
        });
    }

    try {
        const jobId = videoQueue.addJob(
            { videoUrl, pageUrl, timestamp },
            {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestTime: new Date()
            }
        );

        const queueStats = videoQueue.getQueueStats();

        res.json({
            success: true,
            jobId,
            message: 'Video added to in-memory processing queue',
            queuePosition: queueStats.queued,
            estimatedWaitTime: Math.ceil(queueStats.queued / config.MAX_CONCURRENT_DOWNLOADS) * 30,
            processing: {
                mode: 'memory',
                zeroDiskUsage: true,
                currentMemoryUsage: queueStats.memoryUsageFormatted,
                memoryUtilization: queueStats.memoryUtilization
            }
        });

    } catch (error) {
        console.error('❌ Error adding to memory queue:', error.message);

        const statusCode = error.message.includes('Queue is full') ? 503 :
            error.message.includes('Memory') ? 507 : 500;

        res.status(statusCode).json({
            success: false,
            error: error.message,
            memoryInfo: statusCode === 507 ? {
                current: videoQueue.formatMemory(videoQueue.memoryUsage),
                max: videoQueue.formatMemory(config.MAX_TOTAL_MEMORY),
                utilization: Math.round((videoQueue.memoryUsage / config.MAX_TOTAL_MEMORY) * 100)
            } : undefined
        });
    }
});

// Job status endpoint
app.get('/api/job/:jobId', authenticateApiKey, (req, res) => {
    const { jobId } = req.params;
    const jobStatus = videoQueue.getJobStatus(jobId);

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
            workerId: jobStatus.workerId,
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
});

// Cancel job endpoint
app.delete('/api/job/:jobId', authenticateApiKey, (req, res) => {
    const { jobId } = req.params;
    const cancelled = videoQueue.cancelJob(jobId);

    res.json({
        success: cancelled,
        message: cancelled ? 'Job cancelled successfully' : 'Job cannot be cancelled (not in queue or already processing)'
    });
});

// Queue statistics endpoint
app.get('/api/queue/stats', authenticateApiKey, (req, res) => {
    const stats = videoQueue.getQueueStats();

    res.json({
        ...stats,
        config: {
            maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
            maxQueueSize: config.MAX_QUEUE_SIZE,
            queueTimeoutMinutes: config.QUEUE_TIMEOUT / 1000 / 60,
            memoryProcessing: config.MEMORY_PROCESSING,
            maxMemoryPerVideo: videoQueue.formatMemory(config.MAX_MEMORY_PER_VIDEO),
            maxTotalMemory: stats.maxMemoryFormatted,
            autoCleanup: config.AUTO_MEMORY_CLEANUP
        }
    });
});

// Enhanced statistics endpoint
app.get('/api/stats', authenticateApiKey, (req, res) => {
    const queueStats = videoQueue.getQueueStats();
    const processMemory = process.memoryUsage();

    res.json({
        uptime: process.uptime(),
        totalProcessed: queueStats.totalProcessed,
        throughputPerMinute: queueStats.throughputPerMinute,
        memory: {
            process: {
                rss: processMemory.rss,
                heapUsed: processMemory.heapUsed,
                rssFormatted: videoQueue.formatMemory(processMemory.rss),
                heapUsedFormatted: videoQueue.formatMemory(processMemory.heapUsed)
            },
            queue: {
                current: queueStats.memoryUsage,
                currentFormatted: queueStats.memoryUsageFormatted,
                peak: queueStats.peakMemoryUsage,
                peakFormatted: queueStats.peakMemoryFormatted,
                utilization: queueStats.memoryUtilization
            }
        },
        queue: queueStats,
        config: {
            version: '3.0.0-memory',
            memoryProcessing: config.MEMORY_PROCESSING,
            maxFileSize: videoQueue.formatMemory(config.MAX_FILE_SIZE),
            downloadTimeoutSeconds: config.DOWNLOAD_TIMEOUT / 1000,
            maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
            maxQueueSize: config.MAX_QUEUE_SIZE
        }
    });
});

// Telegram bot commands
bot.command('start', (ctx) => {
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

bot.command('memory', async (ctx) => {
    const queueStats = videoQueue.getQueueStats();
    const processMemory = process.memoryUsage();

    ctx.reply(
        `💾 Использование памяти:\n\n` +
        `🔄 Очередь: ${queueStats.memoryUsageFormatted} / ${queueStats.maxMemoryFormatted} (${queueStats.memoryUtilization}%)\n` +
        `📈 Пик: ${queueStats.peakMemoryFormatted}\n` +
        `🖥 Процесс: ${videoQueue.formatMemory(processMemory.rss)}\n` +
        `📊 Heap: ${videoQueue.formatMemory(processMemory.heapUsed)} / ${videoQueue.formatMemory(processMemory.heapTotal)}\n\n` +
        `📹 Активных видео в памяти: ${queueStats.processing}\n` +
        `⚡ Режим: Zero disk usage\n` +
        `🧹 Автоочистка: ${queueStats.autoCleanup ? 'Включена' : 'Отключена'}\n` +
        `📈 Обработано всего: ${queueStats.totalProcessed}`
    );
});

bot.command('queue', async (ctx) => {
    const stats = videoQueue.getQueueStats();

    ctx.reply(
        `📊 Статус очереди (Memory Mode):\n\n` +
        `⏳ В очереди: ${stats.queued}\n` +
        `🔄 Обрабатывается: ${stats.processing}\n` +
        `✅ Завершено: ${stats.completed}\n` +
        `❌ Ошибки: ${stats.failed}\n` +
        `👷 Воркеры: ${stats.activeWorkers}/${stats.maxWorkers}\n\n` +
        `💾 Память: ${stats.memoryUsageFormatted} / ${stats.maxMemoryFormatted} (${stats.memoryUtilization}%)\n` +
        `📈 Производительность: ${stats.throughputPerMinute} видео/мин\n` +
        `🚀 Обработка: В памяти без использования диска`
    );
});

bot.command('stats', async (ctx) => {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const queueStats = videoQueue.getQueueStats();

    ctx.reply(
        `📊 Статистика сервера Memory Edition:\n\n` +
        `⏱ Время работы: ${hours}ч ${minutes}м\n` +
        `💾 Память процесса: ${videoQueue.formatMemory(process.memoryUsage().rss)}\n` +
        `🔄 Статус: Активен (Memory Mode)\n\n` +
        `📊 Очередь:\n` +
        `• Ожидает: ${queueStats.queued}\n` +
        `• Обрабатывается: ${queueStats.processing}\n` +
        `• Завершено: ${queueStats.completed}\n` +
        `• Ошибки: ${queueStats.failed}\n\n` +
        `💾 Память очереди: ${queueStats.memoryUsageFormatted}\n` +
        `📈 Производительность: ${queueStats.throughputPerMinute} видео/мин\n` +
        `🏆 Пик памяти: ${queueStats.peakMemoryFormatted}`
    );
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// Graceful shutdown handling
const shutdown = () => {
    console.log('\n🔄 Shutting down gracefully...');
    console.log(`💾 Memory at shutdown: ${videoQueue.formatMemory(videoQueue.memoryUsage)}`);
    console.log(`📊 Total processed: ${videoQueue.totalProcessed}`);

    // Stop accepting new requests
    console.log('🚫 Stopping new job acceptance...');

    // Wait for active jobs to complete
    if (videoQueue.activeWorkers > 0) {
        console.log(`⏳ Waiting for ${videoQueue.activeWorkers} active jobs to complete...`);

        const checkInterval = setInterval(() => {
            if (videoQueue.activeWorkers === 0) {
                clearInterval(checkInterval);
                console.log('✅ All jobs completed');
                bot.stop('SIGTERM');
                process.exit(0);
            }
        }, 1000);

        // Force shutdown after 30 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏰ Force shutdown after timeout');
            bot.stop('SIGTERM');
            process.exit(1);
        }, 30000);
    } else {
        bot.stop('SIGTERM');
        process.exit(0);
    }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Application startup
const start = async () => {
    try {
        // Validate dependencies
        await execAsync('yt-dlp --version');
        console.log('✅ yt-dlp found');

        // Start HTTP server
        app.listen(config.PORT, () => {
            console.log(`🚀 Server running on port ${config.PORT} with IN-MEMORY processing`);
            console.log(`📺 Telegram channel: ${config.CHANNEL_ID}`);
            console.log(`⚡ Queue: max ${config.MAX_CONCURRENT_DOWNLOADS} concurrent, ${config.MAX_QUEUE_SIZE} queue size`);
            console.log(`💾 Memory limits: ${videoQueue.formatMemory(config.MAX_MEMORY_PER_VIDEO)} per video, ${videoQueue.formatMemory(config.MAX_TOTAL_MEMORY)} total`);
            console.log(`🚀 Zero disk usage mode enabled!`);
            console.log(`🔧 Debug memory: ${config.DEBUG_MEMORY ? 'enabled' : 'disabled'}`);
        });

        // Start Telegram bot
        await bot.launch();
        console.log('🤖 Telegram bot started');

        // Log system information
        const systemMem = os.totalmem();
        const freeMem = os.freemem();
        console.log(`💻 System: ${videoQueue.formatMemory(freeMem)} free / ${videoQueue.formatMemory(systemMem)} total RAM`);

        if (freeMem < config.MAX_TOTAL_MEMORY * 2) {
            console.warn(`⚠️ Warning: Low system memory. Consider reducing MAX_TOTAL_MEMORY.`);
        }

    } catch (error) {
        console.error('❌ Failed to start:', error.message);

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
};

start();