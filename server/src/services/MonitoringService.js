const { EventEmitter } = require('events');
const config = require('../config');

/**
 * Unified monitoring service for the application
 */
class MonitoringService extends EventEmitter {
    constructor(videoQueue) {
        super();
        this.videoQueue = videoQueue;
        this.startTime = Date.now();
        this.stats = {
            totalProcessed: 0,
            totalFailed: 0,
            totalMemoryUsed: 0,
            peakMemoryUsed: 0,
            lastUpdate: new Date()
        };

        // Setup periodic stats update
        this.setupPeriodicUpdate();
    }

    /**
     * Get comprehensive system stats
     */
    getSystemStats() {
        const processMemory = process.memoryUsage();
        const uptime = process.uptime();
        const queueStats = this.videoQueue.getQueueStats();

        return {
            status: 'OK',
            version: config.VERSION,
            timestamp: new Date().toISOString(),
            uptime: Math.round(uptime),
            memory: {
                process: {
                    rss: processMemory.rss,
                    heapUsed: processMemory.heapUsed,
                    rssFormatted: this.formatMemory(processMemory.rss),
                    heapUsedFormatted: this.formatMemory(processMemory.heapUsed)
                }
            },
            queue: {
                queued: queueStats.queued,
                processing: queueStats.processing,
                completed: queueStats.completed,
                failed: queueStats.failed,
                totalProcessed: queueStats.totalProcessed,
                throughputPerMinute: queueStats.throughputPerMinute,
                activeWorkers: queueStats.activeWorkers,
                maxWorkers: queueStats.maxWorkers
            },
            features: {
                memoryProcessing: config.MEMORY_PROCESSING,
                zeroDiskUsage: true,
                concurrentProcessing: true
            }
        };
    }

    /**
     * Get queue statistics
     */
    getQueueStats() {
        const queueStats = this.videoQueue.getQueueStats();
        return {
            ...queueStats,
            config: {
                maxConcurrentDownloads: config.MAX_CONCURRENT_DOWNLOADS,
                maxQueueSize: config.MAX_QUEUE_SIZE,
                queueTimeoutMinutes: config.QUEUE_TIMEOUT / 1000 / 60
            }
        };
    }

    /**
     * Update monitoring stats
     */
    updateStats() {
        const queueStats = this.videoQueue.getQueueStats();
        const processMemory = process.memoryUsage();

        this.stats = {
            ...this.stats,
            totalProcessed: queueStats.totalProcessed,
            totalFailed: queueStats.failed,
            totalMemoryUsed: processMemory.rss,
            peakMemoryUsed: Math.max(this.stats.peakMemoryUsed, processMemory.rss),
            lastUpdate: new Date()
        };

        this.emit('statsUpdated', this.stats);
    }

    /**
     * Setup periodic stats update
     */
    setupPeriodicUpdate() {
        // Update stats every 30 seconds
        setInterval(() => {
            this.updateStats();
        }, 30000);
    }

    /**
     * Format memory bytes to human readable string
     */
    formatMemory(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
    }

    /**
     * Get monitoring statistics
     */
    getStats() {
        return {
            ...this.stats,
            uptime: Math.round(process.uptime()),
            memoryFormatted: this.formatMemory(this.stats.totalMemoryUsed),
            peakMemoryFormatted: this.formatMemory(this.stats.peakMemoryUsed)
        };
    }
}

module.exports = MonitoringService;
