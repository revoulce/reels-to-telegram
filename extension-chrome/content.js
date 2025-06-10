/**
 * Instagram to Telegram Extension v4.1 - Unified Content Script
 * Trojan Horse approach with URL-only processing
 */

// ========================================
// Configuration Constants
// ========================================
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

// ========================================
// URL Extractor Utility
// ========================================
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

// ========================================
// Instagram Notification System
// ========================================
class InstagramNotification {
  static init() {
    this.ensureStyles();
  }

  static show(message, type = "success", duration = 3000) {
    // Remove existing notifications
    document
      .querySelectorAll(".ig-telegram-notification")
      .forEach((n) => n.remove());

    const notification = document.createElement("div");
    notification.className = `ig-telegram-notification ig-telegram-notification--${type}`;

    // Instagram-style notification styling
    const styles = {
      position: "fixed",
      top: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      background: type === "success" ? "#262626" : "#ed4956",
      color: "white",
      padding: "12px 16px",
      borderRadius: "8px",
      zIndex: "999999",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: "14px",
      fontWeight: "400",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      maxWidth: "400px",
      animation: "igSlideIn 0.15s ease",
    };

    Object.assign(notification.style, styles);

    const icon = type === "success" ? "✓" : "⚠";
    notification.innerHTML = `
      <span style="font-size: 16px;">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // Auto-hide
    setTimeout(() => {
      notification.style.animation = "igSlideOut 0.15s ease";
      setTimeout(() => notification.remove(), 150);
    }, duration);
  }

  static ensureStyles() {
    if (!document.getElementById("ig-telegram-styles")) {
      const style = document.createElement("style");
      style.id = "ig-telegram-styles";
      style.textContent = `
        @keyframes igSlideIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes igSlideOut {
          from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
          to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// ========================================
// Instagram Queue Panel
// ========================================
class InstagramQueuePanel {
  constructor(config, urlExtractor) {
    this.config = config;
    this.urlExtractor = urlExtractor;
    this.panel = null;
    this.jobs = new Map();
    this.isVisible = false;
  }

  create() {
    this.remove();
    this.panel = this.createPanelElement();
    this.setupEventHandlers();
    this.ensureStyles();
    document.body.appendChild(this.panel);
  }

  createPanelElement() {
    const panel = document.createElement("div");
    panel.id = this.config.UI.QUEUE_PANEL_ID;

    // Background overlay
    Object.assign(panel.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      bottom: "0",
      background: "rgba(0, 0, 0, 0.65)",
      zIndex: "999998",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    });

    // Modal content
    const modal = this.createModalContent();
    panel.appendChild(modal);

    return panel;
  }

  createModalContent() {
    const modal = document.createElement("div");
    Object.assign(modal.style, {
      background: "#ffffff",
      borderRadius: "12px",
      width: "400px",
      maxWidth: "calc(100vw - 40px)",
      maxHeight: "calc(100vh - 40px)",
      overflow: "hidden",
      animation: "igModalIn 0.15s ease",
    });

    // Header
    const header = this.createHeader();
    modal.appendChild(header);

    // Content container
    this.contentContainer = this.createContentContainer();
    modal.appendChild(this.contentContainer);

    return modal;
  }

  createHeader() {
    const header = document.createElement("div");
    header.innerHTML = `
      <div style="
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #dbdbdb;
      ">
        <div style="font-size: 16px; font-weight: 600; color: #262626;">
          Telegram Queue
        </div>
        <button id="ig-queue-close" style="
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          border-radius: 50%;
          transition: background-color 0.1s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="1.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
    return header;
  }

  createContentContainer() {
    const container = document.createElement("div");
    container.style.cssText = "max-height: 400px; overflow-y: auto;";
    container.innerHTML = this.getEmptyStateHTML();
    return container;
  }

  getEmptyStateHTML() {
    return `
      <div id="ig-empty-queue" style="
        padding: 48px 32px;
        text-align: center;
        color: #8e8e8e;
      ">
        <div style="
          width: 96px;
          height: 96px;
          margin: 0 auto 24px;
          border: 3px solid #262626;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
        ">📭</div>
        <div style="font-size: 22px; font-weight: 300; color: #262626; margin-bottom: 16px;">
          No items in queue
        </div>
        <div style="font-size: 14px; line-height: 1.4;">
          Videos and photos you send to Telegram will appear here
        </div>
      </div>
    `;
  }

  setupEventHandlers() {
    // Close on background click
    this.panel.addEventListener("click", (e) => {
      if (e.target === this.panel) this.hide();
    });

    // Close button
    this.panel
      .querySelector("#ig-queue-close")
      .addEventListener("click", () => this.hide());
  }

  show() {
    if (this.panel) {
      this.panel.style.display = "flex";
      this.isVisible = true;
    }
  }

  hide() {
    if (this.panel) {
      this.panel.style.display = "none";
      this.isVisible = false;
    }
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  addJob(jobId, jobData) {
    this.hideEmptyState();
    const jobElement = this.createJobElement(jobId, jobData);
    this.jobs.set(jobId, jobElement);
    this.contentContainer.appendChild(jobElement);
    this.show();
  }

  createJobElement(jobId, jobData) {
    const jobElement = document.createElement("div");
    jobElement.className = "ig-queue-item";
    jobElement.style.cssText = `
      padding: 16px;
      border-bottom: 1px solid #dbdbdb;
      transition: background-color 0.1s ease;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    `;

    const contentTitle = this.urlExtractor.extractTitleFromUrl(jobData.pageUrl);
    const contentType = this.urlExtractor.getContentType(jobData.pageUrl);

    jobElement.innerHTML = `
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 8px;
        background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 18px;
      ">${contentType}</div>

      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 14px; color: #262626; margin-bottom: 4px;">
          ${contentTitle}
        </div>
        <div class="job-status" style="
          font-size: 12px;
          color: #8e8e8e;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <div class="status-dot" style="
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #0095f6;
            animation: igPulse 1.5s infinite;
          "></div>
          <span>In queue (position: ${jobData.queuePosition || "?"})</span>
        </div>
        <div class="job-progress" style="display: none; margin-top: 8px;">
          <div style="
            height: 2px;
            background: #dbdbdb;
            border-radius: 1px;
            overflow: hidden;
          ">
            <div class="progress-bar" style="
              height: 100%;
              background: #0095f6;
              border-radius: 1px;
              width: 0%;
              transition: width 0.3s ease;
            "></div>
          </div>
          <div class="progress-text" style="
            margin-top: 4px;
            font-size: 11px;
            color: #8e8e8e;
            text-align: center;
          "></div>
        </div>
      </div>

      <div class="item-actions">
        <button class="cancel-btn" style="
          background: none;
          border: none;
          padding: 6px;
          cursor: pointer;
          border-radius: 50%;
          transition: background-color 0.1s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e8e" stroke-width="1.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    // Cancel button handler
    jobElement.querySelector(".cancel-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.cancelJob(jobId);
    });

    return jobElement;
  }

  updateJob(jobId, status) {
    const jobElement = this.jobs.get(jobId);
    if (!jobElement) return;

    const statusEl = jobElement.querySelector(".job-status");
    const statusDot = jobElement.querySelector(".status-dot");
    const statusText = statusEl.querySelector("span");
    const progressEl = jobElement.querySelector(".job-progress");
    const progressBar = jobElement.querySelector(".progress-bar");
    const progressText = jobElement.querySelector(".progress-text");
    const cancelBtn = jobElement.querySelector(".cancel-btn");

    switch (status.status) {
      case "processing":
        this.updateProcessingStatus(
          statusDot,
          statusText,
          progressEl,
          progressBar,
          progressText,
          cancelBtn,
          status
        );
        break;
      case "completed":
        this.updateCompletedStatus(
          statusDot,
          statusText,
          progressEl,
          cancelBtn
        );
        setTimeout(() => this.removeJob(jobId), 5000);
        break;
      case "failed":
        this.updateFailedStatus(
          statusDot,
          statusText,
          progressEl,
          cancelBtn,
          status
        );
        setTimeout(() => this.removeJob(jobId), 10000);
        break;
    }
  }

  updateProcessingStatus(
    statusDot,
    statusText,
    progressEl,
    progressBar,
    progressText,
    cancelBtn,
    status
  ) {
    statusDot.style.background = "#0095f6";
    statusText.textContent = "Processing";

    if (status.progress !== undefined) {
      progressEl.style.display = "block";
      progressBar.style.width = `${status.progress}%`;
      progressText.textContent =
        status.progressMessage || `${status.progress}%`;
    }
    cancelBtn.style.display = "none";
  }

  updateCompletedStatus(statusDot, statusText, progressEl, cancelBtn) {
    statusDot.style.background = "#00ba7c";
    statusDot.style.animation = "none";
    statusText.textContent = "Sent to Telegram";
    progressEl.style.display = "none";
    cancelBtn.style.display = "none";
  }

  updateFailedStatus(statusDot, statusText, progressEl, cancelBtn, status) {
    statusDot.style.background = "#ed4956";
    statusDot.style.animation = "none";
    statusText.textContent = `Error: ${status.error || "Unknown error"}`;
    progressEl.style.display = "none";
    cancelBtn.style.display = "none";
  }

  removeJob(jobId) {
    const jobElement = this.jobs.get(jobId);
    if (jobElement) {
      jobElement.style.opacity = "0";
      jobElement.style.transform = "translateX(20px)";
      setTimeout(() => {
        jobElement.remove();
        this.jobs.delete(jobId);
        this.checkEmptyState();
      }, 150);
    }
  }

  async cancelJob(jobId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "cancelJob",
        jobId,
      });

      if (response.success) {
        InstagramNotification.show("Job cancelled", "success");
        this.removeJob(jobId);
      } else {
        InstagramNotification.show("Failed to cancel job", "error");
      }
    } catch (error) {
      InstagramNotification.show("Error cancelling job", "error");
    }
  }

  hideEmptyState() {
    const emptyState = this.contentContainer.querySelector("#ig-empty-queue");
    if (emptyState) {
      emptyState.style.display = "none";
    }
  }

  checkEmptyState() {
    if (this.jobs.size === 0) {
      const emptyState = this.contentContainer.querySelector("#ig-empty-queue");
      if (emptyState) {
        emptyState.style.display = "block";
      }
      setTimeout(() => this.hide(), 2000);
    }
  }

  remove() {
    const existing = document.getElementById(this.config.UI.QUEUE_PANEL_ID);
    if (existing) {
      existing.remove();
    }
    this.panel = null;
    this.jobs.clear();
  }

  ensureStyles() {
    if (!document.getElementById("ig-modal-styles")) {
      const style = document.createElement("style");
      style.id = "ig-modal-styles";
      style.textContent = `
        @keyframes igModalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes igPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .ig-queue-item:hover {
          background: #fafafa !important;
        }
        #ig-queue-close:hover, .cancel-btn:hover {
          background: #fafafa !important;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// ========================================
// Main Trojan Horse Extension
// ========================================
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

// ========================================
// Extension Initialization
// ========================================
function initializeExtension() {
  try {
    console.log("🎭 Initializing Trojan Horse Extension v4.1...");

    // Initialize components
    const extractor = new URLExtractor(CONFIG);
    const queuePanel = new InstagramQueuePanel(CONFIG, extractor);

    // Initialize notification system
    InstagramNotification.init();

    // Create main extension instance
    const trojanHorse = new TrojanHorseExtension(
      CONFIG,
      extractor,
      InstagramNotification,
      queuePanel
    );

    // Export for debugging
    window.trojanHorse = trojanHorse;

    console.log("🎭 Trojan Horse Extension v4.1 initialized successfully!");
  } catch (error) {
    console.error("🎭 Extension initialization failed:", error);

    // Basic fallback
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

// ========================================
// Bootstrap
// ========================================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}

window.addEventListener("load", initializeExtension);

console.log("🎭 Trojan Horse Extension v4.1 - Unified version loaded!");
