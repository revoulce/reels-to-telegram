/**
 * Configuration constants for extension
 */
const CONFIG = {
  UI: {
    QUEUE_PANEL_ID: "telegram-queue-panel",
  },
  PATHS: {
    REELS: ["/reels/", "/reel/"],
    STORIES: ["/stories/"],
    POSTS: ["/p/"],
  },
  NOTIFICATIONS: {
    SUCCESS_DURATION: 3000,
    ERROR_DURATION: 4000,
    INFO_DURATION: 2500,
  },
  SELECTORS: {
    SHARE_BUTTONS: [
      'button[aria-label*="Share"]',
      'button[aria-label*="share"]',
      'div[role="button"][aria-label*="Share"]',
      'svg[aria-label*="Share"]',
      'button:has(svg[aria-label*="Share"])',
      'button:has(svg path[d*="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"])',
    ],
    ACTION_CONTAINERS: 'section, div[role="toolbar"], div',
  },
  TIMING: {
    INIT_DELAY: 2000,
    OBSERVATION_DELAY: 100,
    URL_CHECK_DELAY: 500,
    REHIJACK_DELAY: 100,
  },
};

// Export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
}
