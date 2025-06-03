/**
 * Memory utilities for formatting and monitoring
 */

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatMemory(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format number with K/M suffixes
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
    if (!num || num === 0) return '';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

/**
 * Get current memory usage
 * @returns {object}
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        rssFormatted: formatMemory(usage.rss),
        heapUsedFormatted: formatMemory(usage.heapUsed),
        heapTotalFormatted: formatMemory(usage.heapTotal)
    };
}

/**
 * Get system memory info
 * @returns {object}
 */
function getSystemMemory() {
    const os = require('os');
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
        total,
        free,
        used,
        totalFormatted: formatMemory(total),
        freeFormatted: formatMemory(free),
        usedFormatted: formatMemory(used),
        utilization: Math.round((used / total) * 100)
    };
}

module.exports = {
    formatMemory,
    formatNumber,
    getMemoryUsage,
    getSystemMemory
};