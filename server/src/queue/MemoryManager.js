const { EventEmitter } = require('events');
const config = require('../config');
const { formatMemory } = require('../utils/memory');

/**
 * Memory Manager - handles memory allocation and monitoring
 */
class MemoryManager extends EventEmitter {
    constructor() {
        super();

        this.currentUsage = 0;
        this.peakUsage = 0;
        this.allocations = new Map(); // jobId -> allocated bytes

        this.initializeMonitoring();

        console.log(`💾 MemoryManager initialized - Limits: ${formatMemory(config.MAX_MEMORY_PER_VIDEO)} per video, ${formatMemory(config.MAX_TOTAL_MEMORY)} total`);
    }

    /**
     * Check if memory allocation is possible
     * @param {number} requestedBytes
     * @throws {Error}
     */
    validateAllocation(requestedBytes) {
        // Check per-video limit
        if (requestedBytes > config.MAX_MEMORY_PER_VIDEO) {
            throw new Error(`Video too large: ${formatMemory(requestedBytes)} > ${formatMemory(config.MAX_MEMORY_PER_VIDEO)}`);
        }

        // Check total memory limit
        const newTotal = this.currentUsage + requestedBytes;
        if (newTotal > config.MAX_TOTAL_MEMORY) {
            throw new Error(`Memory limit would be exceeded: ${formatMemory(newTotal)} > ${formatMemory(config.MAX_TOTAL_MEMORY)}`);
        }

        // Warning threshold check
        const usagePercent = (newTotal / config.MAX_TOTAL_MEMORY) * 100;
        if (usagePercent > config.MEMORY_WARNING_THRESHOLD) {
            console.warn(`⚠️ High memory usage: ${usagePercent.toFixed(1)}%`);
        }

        // Critical threshold check
        if (usagePercent > 95) {
            throw new Error(`Memory nearly exhausted (${usagePercent.toFixed(1)}%). Please try again later.`);
        }
    }

    /**
     * Allocate memory for a job
     * @param {string} jobId
     * @param {number} bytes
     */
    allocate(jobId, bytes) {
        this.validateAllocation(bytes);

        this.currentUsage += bytes;
        this.peakUsage = Math.max(this.peakUsage, this.currentUsage);
        this.allocations.set(jobId, bytes);

        this.emit('memoryAllocated', jobId, bytes, this.currentUsage);

        if (config.DEBUG_MEMORY) {
            console.log(`💾 Allocated ${formatMemory(bytes)} for job ${jobId.substring(0, 8)} (total: ${formatMemory(this.currentUsage)})`);
        }
    }

    /**
     * Free memory for a job
     * @param {string} jobId
     */
    free(jobId) {
        const allocated = this.allocations.get(jobId);
        if (!allocated) return;

        this.currentUsage -= allocated;
        this.allocations.delete(jobId);

        this.emit('memoryFreed', jobId, allocated, this.currentUsage);

        if (config.DEBUG_MEMORY) {
            console.log(`💾 Freed ${formatMemory(allocated)} for job ${jobId.substring(0, 8)} (total: ${formatMemory(this.currentUsage)})`);
        }

        // Suggest garbage collection for large allocations
        if (allocated > 10 * 1024 * 1024 && global.gc) { // > 10MB
            global.gc();
        }
    }

    /**
     * Get current memory statistics
     * @returns {object}
     */
    getStats() {
        return {
            current: this.currentUsage,
            currentFormatted: formatMemory(this.currentUsage),
            peak: this.peakUsage,
            peakFormatted: formatMemory(this.peakUsage),
            max: config.MAX_TOTAL_MEMORY,
            maxFormatted: formatMemory(config.MAX_TOTAL_MEMORY),
            utilization: Math.round((this.currentUsage / config.MAX_TOTAL_MEMORY) * 100),
            activeAllocations: this.allocations.size,
            maxPerVideo: config.MAX_MEMORY_PER_VIDEO,
            maxPerVideoFormatted: formatMemory(config.MAX_MEMORY_PER_VIDEO)
        };
    }

    /**
     * Get allocation info for specific job
     * @param {string} jobId
     * @returns {number|null}
     */
    getAllocation(jobId) {
        return this.allocations.get(jobId) || null;
    }

    /**
     * Force cleanup of allocations for completed jobs
     * @param {Set} activeJobIds
     */
    cleanup(activeJobIds) {
        let freed = 0;

        for (const [jobId, bytes] of this.allocations.entries()) {
            if (!activeJobIds.has(jobId)) {
                this.currentUsage -= bytes;
                this.allocations.delete(jobId);
                freed += bytes;
            }
        }

        if (freed > 0) {
            console.log(`🧹 Force freed ${formatMemory(freed)} from orphaned allocations`);
            this.emit('memoryCleanup', freed);
        }
    }

    /**
     * Initialize memory monitoring
     */
    initializeMonitoring() {
        if (config.MEMORY_LOG_INTERVAL > 0) {
            setInterval(() => {
                this.logMemoryStatus();
            }, config.MEMORY_LOG_INTERVAL);
        }

        // Periodic cleanup check every 10 minutes
        setInterval(() => {
            if (this.currentUsage === 0 && global.gc) {
                global.gc();
                console.log('🧹 Suggested garbage collection');
            }
        }, 10 * 60 * 1000);
    }

    /**
     * Log current memory status
     */
    logMemoryStatus() {
        if (this.currentUsage > 0 || this.allocations.size > 0) {
            const stats = this.getStats();
            console.log(`📊 Memory Status: ${stats.currentFormatted}/${stats.maxFormatted} (${stats.utilization}%) | Allocations: ${stats.activeAllocations} | Peak: ${stats.peakFormatted}`);
        }
    }
}

module.exports = MemoryManager;