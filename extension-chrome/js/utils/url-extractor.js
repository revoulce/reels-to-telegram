/**
 * URL Extractor - handles page data extraction
 */
class URLExtractor {
  constructor(config) {
    this.config = config;
  }

  isValidPage() {
    const path = window.location.pathname;
    const isValid =
      this.config.PATHS.REELS.some((p) => path.includes(p)) ||
      this.config.PATHS.STORIES.some((p) => path.includes(p)) ||
      this.config.PATHS.POSTS.some((p) => path.includes(p));

    console.log("🎭 Page validation:", { path, isValid });
    return isValid;
  }

  extractPageData() {
    const pageUrl = window.location.href;
    console.log("🎭 Extracting page data:", { pageUrl });

    return {
      pageUrl,
      timestamp: new Date().toISOString(),
    };
  }

  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/");

      if (url.includes("/reels/") || url.includes("/reel/")) {
        return `Instagram Reel`;
      } else if (url.includes("/p/")) {
        return `Instagram Post`;
      } else if (url.includes("/stories/")) {
        return "Instagram Story";
      }

      return "Instagram Content";
    } catch {
      return "Instagram Content";
    }
  }

  getContentType(url) {
    if (url.includes("/reels/") || url.includes("/reel/")) return "📹";
    if (url.includes("/stories/")) return "📷";
    if (url.includes("/p/")) return "🖼️";
    return "📱";
  }
}

// Export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = URLExtractor;
} else if (typeof window !== "undefined") {
  window.URLExtractor = URLExtractor;
}
