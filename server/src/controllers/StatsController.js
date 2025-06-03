const config = require('../config');
const { getMemoryUsage, getSystemMemory } = require('../utils/memory');

/**
 * Stats Controller - handles statistics and monitoring endpoints
 */
class StatsController {
    constructor(videoQueue) {
        this.videoQueue = videoQueue;
    }

    /**
     * GET /health
     * Basic health check with comprehensive system info
     */
    async getHealth(req, res) {
        const queueStats = this.videoQueue.getQueueStats();
        const processMemory = getMemoryUsage();
        const systemMemory = getSystemMemory();

        res.json({
            status: 'OK',
            version: '3.0.0-memory',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                process: processMemory,
                queue: {
                    used: queueStats.memoryUsage,
                    usedFormatted: queueStats.memoryUsageFormatted,
                    max: queueStats.maxMemory,
                    maxFormatted: queueStats.maxMemoryFormatted,
                    utilization: queueStats.memoryUtilization,
                    peak: queueStats.peakMemoryUsage,
                    peakFormatted: queueStats.peakMemoryFormatted
                },
                system: systemMemory
            },
            queue: queueStats,
            features: {
                memoryProcessing: config.MEMORY_PROCESSING,
                zeroDiskUsage: true,
                autoCleanup: config.AUTO_MEMORY_CLEANUP,
                concurrentProcessing: true
            }
        });
    }

    /**
     * GET /api/health
     * API health check (lightweight)
     */
    async getApiHealth(req, res) {
        res.json({
            status: 'OK',
            version: '3.0.0-memory',
            timestamp: new Date().toISOString(),
            queue: this.videoQueue.getQueueStats(),
            features: ['memory-processing', 'zero-disk-usage', 'concurrent-queue']
        });
    }

    /**
     * GET /api/queue/stats
     * Queue statistics
     */
    async getQueueStats(req, res) {
        const stats = this.videoQueue.getQueueStats();

        res.json({
            ...stats,
            config: {
                maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
                maxQueueSize: config.MAX_QUEUE_SIZE,
                queueTimeoutMinutes: config.QUEUE_TIMEOUT / 1000 / 60,
                memoryProcessing: config.MEMORY_PROCESSING,
                maxMemoryPerVideo: this.formatMemory(config.MAX_MEMORY_PER_VIDEO),
                maxTotalMemory: stats.maxMemoryFormatted,
                autoCleanup: config.AUTO_MEMORY_CLEANUP
            }
        });
    }

    /**
     * GET /api/queue/jobs
     * List all jobs with pagination
     */
    async getQueueJobs(req, res) {
        const limit = Math.min(parseInt(req.query.limit) || 100, 100);
        const offset = parseInt(req.query.offset) || 0;

        const result = this.videoQueue.getAllJobs(limit, offset);

        res.json(result);
    }

    /**
     * GET /api/stats
     * Comprehensive statistics
     */
    async getStats(req, res) {
        const queueStats = this.videoQueue.getQueueStats();
        const processMemory = getMemoryUsage();

        res.json({
            uptime: process.uptime(),
            totalProcessed: queueStats.totalProcessed,
            throughputPerMinute: queueStats.throughputPerMinute,
            memory: {
                process: processMemory,
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
                maxFileSize: this.formatMemory(config.MAX_FILE_SIZE),
                downloadTimeoutSeconds: config.DOWNLOAD_TIMEOUT / 1000,
                maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
                maxQueueSize: config.MAX_QUEUE_SIZE
            }
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
}

module.exports = StatsController;