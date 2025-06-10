const config = require("../config");

/**
 * Validate Instagram URL
 * @param {string} url
 * @returns {boolean}
 */
function validateInstagramUrl(url) {
  try {
    const urlObj = new URL(url);
    const isInstagram = config.SUPPORTED_DOMAINS.includes(urlObj.hostname);
    const isValidPath =
      urlObj.pathname.includes("/reels/") ||
      urlObj.pathname.includes("/reel/") || // Both singular and plural forms
      urlObj.pathname.includes("/stories/") ||
      urlObj.pathname.includes("/p/");
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
  if (!text) return "";
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "") // Remove emojis
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}

/**
 * Validate page data structure
 * @param {object} pageData
 * @throws {Error}
 */
function validatePageData(pageData) {
  if (!pageData) {
    throw new Error("Page data is required");
  }

  if (!pageData.pageUrl) {
    throw new Error("pageUrl is required");
  }

  if (!validateInstagramUrl(pageData.pageUrl)) {
    throw new Error(
      "Invalid Instagram URL. Must be instagram.com with /reels/, /stories/, or /p/ path"
    );
  }
}

module.exports = {
  validateInstagramUrl,
  cleanText,
  validatePageData,
};
