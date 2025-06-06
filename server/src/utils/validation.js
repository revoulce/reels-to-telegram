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
 * Estimate media size based on URL patterns
 * @param {string} pageUrl
 * @returns {number} estimated size in bytes
 */
function estimateMediaSize(pageUrl) {
  if (pageUrl.includes("/reels/")) return 30 * 1024 * 1024; // 30MB
  if (pageUrl.includes("/stories/")) return 15 * 1024 * 1024; // 15MB
  if (pageUrl.includes("/p/")) return 5 * 1024 * 1024; // 5MB для фото/видео постов
  return 25 * 1024 * 1024; // 25MB default
}

/**
 * Validate media data structure
 * @param {object} mediaData
 * @throws {Error}
 */
function validateMediaData(mediaData) {
  if (!mediaData) {
    throw new Error("Media data is required");
  }

  if (!mediaData.pageUrl) {
    throw new Error("pageUrl is required");
  }

  if (!validateInstagramUrl(mediaData.pageUrl)) {
    throw new Error(
      "Invalid Instagram URL. Must be instagram.com with /reels/, /stories/, or /p/ path"
    );
  }
}

module.exports = {
  validateInstagramUrl,
  cleanText,
  estimateMediaSize,
  validateMediaData,
};
