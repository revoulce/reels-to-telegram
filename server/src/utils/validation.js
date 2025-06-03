const config = require('../config');

/**
 * Validate Instagram URL
 * @param {string} url
 * @returns {boolean}
 */
function validateInstagramUrl(url) {
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
}

/**
 * Clean text for Telegram caption
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
}

/**
 * Estimate video size based on URL patterns
 * @param {string} pageUrl
 * @returns {number} estimated size in bytes
 */
function estimateVideoSize(pageUrl) {
    if (pageUrl.includes('/reels/')) return 30 * 1024 * 1024; // 30MB
    if (pageUrl.includes('/stories/')) return 15 * 1024 * 1024; // 15MB
    return 25 * 1024 * 1024; // 25MB default
}

/**
 * Validate video data structure
 * @param {object} videoData
 * @throws {Error}
 */
function validateVideoData(videoData) {
    if (!videoData) {
        throw new Error('Video data is required');
    }

    if (!videoData.pageUrl) {
        throw new Error('pageUrl is required');
    }

    if (!validateInstagramUrl(videoData.pageUrl)) {
        throw new Error('Invalid Instagram URL. Must be instagram.com with /reels/, /stories/, or /p/ path');
    }
}

module.exports = {
    validateInstagramUrl,
    cleanText,
    estimateVideoSize,
    validateVideoData
};