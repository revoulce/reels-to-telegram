/**
 * Main Trojan Horse Extension class
 */
class TrojanHorseExtension {
  constructor(config, extractor, notification, queuePanel) {
    this.config = config;
    this.extractor = extractor;
    this.notification = notification;
    this.queuePanel = queuePanel;

    this.observer = null;
    this.urlObserver = null;
    this.lastUrl = location.href;
    this.isInitialized = false;
    this.hijackedButtons = new Set();

    this.setupUrlMonitoring();
    this.setupMessageListener();
    this.init();
  }

  init() {
    if (this.extractor.isValidPage()) {
      setTimeout(() => {
        this.hijackShareButtons();
        this.observeChanges();
        this.isInitialized = true;
        console.log("🎭 Trojan Horse activated!");
      }, this.config.TIMING.INIT_DELAY);
    } else {
      this.cleanup();
    }
  }

  hijackShareButtons() {
    // Find share buttons using various selectors
    this.config.SELECTORS.SHARE_BUTTONS.forEach((selector) => {
      try {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach((button) => this.hijackButton(button));
      } catch (e) {
        console.log("🎭 Selector failed:", selector);
      }
    });

    // Additional structural search
    this.findShareButtonsByStructure();
  }

  findShareButtonsByStructure() {
    const actionContainers = document.querySelectorAll(
      this.config.SELECTORS.ACTION_CONTAINERS
    );

    actionContainers.forEach((container) => {
      const buttons = container.querySelectorAll('button, div[role="button"]');

      // Look for pattern: 3-4 buttons in a row (like, comment, share, [save])
      if (buttons.length >= 3 && buttons.length <= 4) {
        const potentialShareButton = buttons[2]; // Usually Share is the third button

        if (
          potentialShareButton &&
          !this.hijackedButtons.has(potentialShareButton)
        ) {
          this.hijackButton(potentialShareButton);
        }
      }
    });
  }

  hijackButton(button) {
    if (!button || this.hijackedButtons.has(button)) return;

    console.log("🎭 Hijacking button:", button);

    this.replaceShareIcon(button);
    this.updateButtonAttributes(button);
    this.interceptClicks(button);

    this.hijackedButtons.add(button);
  }

  replaceShareIcon(button) {
    const svg = button.querySelector("svg");
    if (!svg) return;

    // Save original attributes
    const width = svg.getAttribute("width") || "24";
    const height = svg.getAttribute("height") || "24";
    const className = svg.className;

    // Replace with Telegram icon
    svg.innerHTML = `
      <path d="M12 2l10 6-4 12-6-4-6 4-4-12z" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12 2v20" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 14l4-6 4 6" fill="none" stroke="currentColor" stroke-width="1.5"/>
    `;

    // Restore attributes
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.className = className;
    svg.setAttribute("viewBox", "0 0 24 24");
  }

  updateButtonAttributes(button) {
    const ariaLabel = button.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.toLowerCase().includes("share")) {
      button.setAttribute("aria-label", "Send to Telegram");
      button.title = "Send to Telegram";
    }
  }

  interceptClicks(button) {
    // Replace button to remove existing handlers
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    // Add our handler
    newButton.addEventListener(
      "click",
      async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        console.log("🎭 Hijacked click detected!");

        // Alternative actions with Shift/Ctrl
        if (e.shiftKey || e.ctrlKey) {
          this.queuePanel.create();
          this.queuePanel.toggle();
          return;
        }

        // Main action - send to Telegram
        await this.handleTelegramSend();
      },
      true
    );

    // Update reference
    this.hijackedButtons.delete(button);
    this.hijackedButtons.add(newButton);
  }

  async handleTelegramSend() {
    try {
      console.log("🎭 Starting Telegram send...");

      const pageData = this.extractor.extractPageData();
      console.log("🎭 Page data extracted:", pageData);

      const response = await chrome.runtime.sendMessage({
        action: "sendToTelegram",
        data: pageData,
      });

      console.log("🎭 Response from background:", response);

      if (!response) {
        throw new Error("No response from background script");
      }

      if (response.success) {
        this.handleSuccessResponse(response.result, pageData);
      } else {
        console.log("🎭 Background returned error:", response.error);
        this.notification.show(
          response.error || "Failed to add content to queue",
          "error"
        );
      }
    } catch (error) {
      this.handleSendError(error);
    }
  }

  handleSuccessResponse(result, pageData) {
    console.log("🎭 Success result:", result);

    this.notification.show(
      `Added to Telegram queue (position: ${result.queuePosition})`,
      "success"
    );

    // Add to queue panel
    this.queuePanel.create();
    this.queuePanel.addJob(result.jobId, {
      ...pageData,
      queuePosition: result.queuePosition,
      estimatedWaitTime: result.estimatedWaitTime,
      realTimeUpdates: result.realTimeUpdates,
    });

    // Show hint about Shift+Click for first job
    if (this.queuePanel.jobs.size === 1) {
      setTimeout(() => {
        this.notification.show(
          "💡 Shift+click to view queue",
          "success",
          this.config.NOTIFICATIONS.INFO_DURATION
        );
      }, 2000);
    }
  }

  handleSendError(error) {
    console.error("🎭 Send handler error:", error);

    let errorMessage = "Connection error. Check server status.";

    if (error.message?.includes("Extension context invalidated")) {
      errorMessage = "Extension needs reload. Please refresh the page.";
    } else if (error.message?.includes("No response")) {
      errorMessage = "Background script not responding. Try refreshing.";
    }

    this.notification.show(errorMessage, "error");
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const handlers = {
        jobProgress: () =>
          this.handleJobProgress(request.jobId, request.status),
        jobFinished: () =>
          this.handleJobFinished(
            request.jobId,
            request.reason,
            request.details
          ),
        queueStatsUpdate: () => this.handleQueueStatsUpdate(request),
        connectionStatusChanged: () =>
          this.handleConnectionStatusChanged(request),
      };

      const handler = handlers[request.action];
      if (handler) {
        handler();
      }

      sendResponse({ received: true });
    });
  }

  handleJobProgress(jobId, status) {
    this.queuePanel.updateJob(jobId, status);
  }

  handleJobFinished(jobId, reason, details) {
    const handlers = {
      completed: () => {
        this.notification.show("✅ Content sent to Telegram!", "success");
        this.queuePanel.updateJob(jobId, { status: "completed", ...details });
      },
      failed: () => {
        const error = details.error || "Unknown error";
        this.notification.show(`❌ Send failed: ${error}`, "error");
        this.queuePanel.updateJob(jobId, { status: "failed", error });
      },
      cancelled: () => {
        this.notification.show("🚫 Job cancelled", "success");
        this.queuePanel.removeJob(jobId);
      },
    };

    const handler = handlers[reason];
    if (handler) handler();
  }

  handleQueueStatsUpdate(stats) {
    // Update statistics if needed
  }

  handleConnectionStatusChanged(request) {
    // Handle connection status changes if needed
  }

  setupUrlMonitoring() {
    this.urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        setTimeout(() => this.init(), this.config.TIMING.URL_CHECK_DELAY);
      }
    });

    this.urlObserver.observe(document, { subtree: true, childList: true });

    // Monitor history changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      setTimeout(() => this.init(), this.config.TIMING.URL_CHECK_DELAY);
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      setTimeout(() => this.init(), this.config.TIMING.URL_CHECK_DELAY);
    };

    window.addEventListener("popstate", () => this.init());
  }

  observeChanges() {
    this.stopObserving();

    this.observer = new MutationObserver((mutations) => {
      let shouldRehijack = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              // Element node
              if (
                node.matches &&
                (node.matches('button[aria-label*="Share"]') ||
                  node.querySelector('button[aria-label*="Share"]'))
              ) {
                shouldRehijack = true;
              }
            }
          });
        }
      });

      if (shouldRehijack) {
        setTimeout(
          () => this.hijackShareButtons(),
          this.config.TIMING.REHIJACK_DELAY
        );
      }
    });

    const targetNode = document.querySelector("main") || document.body;
    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
    });
  }

  cleanup() {
    this.hijackedButtons.clear();
    this.queuePanel.hide();
    this.stopObserving();
    this.isInitialized = false;
    console.log("🎭 Trojan Horse deactivated");
  }

  stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// Export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = TrojanHorseExtension;
} else if (typeof window !== "undefined") {
  window.TrojanHorseExtension = TrojanHorseExtension;
}
