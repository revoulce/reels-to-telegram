/**
 * Content Script - Entry point for Trojan Horse Extension v4.1
 * Modular architecture with clean separation of concerns
 */

// Import all modules
const CONFIG = window.CONFIG;
const URLExtractor = window.URLExtractor;
const InstagramNotification = window.InstagramNotification;
const InstagramQueuePanel = window.InstagramQueuePanel;
const TrojanHorseExtension = window.TrojanHorseExtension;

/**
 * Module Loader - ensures all dependencies are loaded
 */
class ModuleLoader {
  constructor() {
    this.loadedModules = new Set();
    this.requiredModules = [
      "js/config/constants.js",
      "js/utils/url-extractor.js",
      "js/ui/notification.js",
      "js/ui/queue-panel.js",
      "js/core/trojan-horse.js",
    ];
  }

  async loadModules() {
    console.log("🎭 Loading extension modules...");

    try {
      // Load modules sequentially to ensure dependencies
      for (const modulePath of this.requiredModules) {
        await this.loadModule(modulePath);
      }

      console.log("🎭 All modules loaded successfully");
      return true;
    } catch (error) {
      console.error("🎭 Module loading failed:", error);
      return false;
    }
  }

  async loadModule(path) {
    return new Promise((resolve, reject) => {
      if (this.loadedModules.has(path)) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(path);
      script.onload = () => {
        this.loadedModules.add(path);
        console.log(`🎭 Module loaded: ${path}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`🎭 Failed to load module: ${path}`);
        reject(new Error(`Failed to load ${path}`));
      };

      (document.head || document.documentElement).appendChild(script);
    });
  }

  checkDependencies() {
    const dependencies = {
      CONFIG: window.CONFIG,
      URLExtractor: window.URLExtractor,
      InstagramNotification: window.InstagramNotification,
      InstagramQueuePanel: window.InstagramQueuePanel,
      TrojanHorseExtension: window.TrojanHorseExtension,
    };

    const missing = [];
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (!dependency) {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing dependencies: ${missing.join(", ")}`);
    }

    console.log("🎭 All dependencies available");
    return true;
  }
}

/**
 * Extension Initializer
 */
class ExtensionInitializer {
  constructor() {
    this.trojanHorse = null;
    this.moduleLoader = new ModuleLoader();
  }

  async initialize() {
    try {
      // Load all modules
      const modulesLoaded = await this.moduleLoader.loadModules();
      if (!modulesLoaded) {
        throw new Error("Failed to load required modules");
      }

      // Check dependencies
      this.moduleLoader.checkDependencies();

      // Initialize components
      this.initializeComponents();

      console.log("🎭 Trojan Horse Extension v4.1 initialized successfully!");
    } catch (error) {
      console.error("🎭 Extension initialization failed:", error);
      this.fallbackToDirectMode();
    }
  }

  initializeComponents() {
    const config = window.CONFIG;
    const extractor = new window.URLExtractor(config);
    const notification = window.InstagramNotification;
    const queuePanel = new window.InstagramQueuePanel(config, extractor);

    // Initialize notification system
    notification.init();

    // Create main extension instance
    this.trojanHorse = new window.TrojanHorseExtension(
      config,
      extractor,
      notification,
      queuePanel
    );

    // Export for debugging
    window.trojanHorse = this.trojanHorse;
  }

  fallbackToDirectMode() {
    console.log("🎭 Falling back to direct mode...");

    // Create minimal inline implementation
    this.createFallbackImplementation();
  }

  createFallbackImplementation() {
    // Minimal implementation for emergency fallback
    const fallbackConfig = {
      PATHS: {
        REELS: ["/reels/", "/reel/"],
        STORIES: ["/stories/"],
        POSTS: ["/p/"],
      },
    };

    const isValidPage = () => {
      const path = window.location.pathname;
      return (
        fallbackConfig.PATHS.REELS.some((p) => path.includes(p)) ||
        fallbackConfig.PATHS.STORIES.some((p) => path.includes(p)) ||
        fallbackConfig.PATHS.POSTS.some((p) => path.includes(p))
      );
    };

    if (isValidPage()) {
      console.log("🎭 Fallback mode active on valid page");
      // Implement basic share button detection and replacement
      this.basicShareButtonHijacking();
    }
  }

  basicShareButtonHijacking() {
    setTimeout(() => {
      const shareButtons = document.querySelectorAll(
        'button[aria-label*="Share"]'
      );
      shareButtons.forEach((button) => {
        button.addEventListener(
          "click",
          async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
              const response = await chrome.runtime.sendMessage({
                action: "sendToTelegram",
                data: {
                  pageUrl: window.location.href,
                  timestamp: new Date().toISOString(),
                },
              });

              if (response?.success) {
                console.log("🎭 Fallback mode: Content sent successfully");
              }
            } catch (error) {
              console.error("🎭 Fallback mode error:", error);
            }
          },
          true
        );
      });
    }, 2000);
  }
}

/**
 * Bootstrap the extension
 */
function initializeExtension() {
  const initializer = new ExtensionInitializer();
  initializer.initialize();
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}

// Also initialize on full page load
window.addEventListener("load", initializeExtension);

console.log("🎭 Trojan Horse Extension v4.1 - Modular architecture loaded!");
