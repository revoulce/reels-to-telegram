/**
 * Instagram-style queue panel
 */
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
        window.InstagramNotification?.show("Job cancelled", "success");
        this.removeJob(jobId);
      } else {
        window.InstagramNotification?.show("Failed to cancel job", "error");
      }
    } catch (error) {
      window.InstagramNotification?.show("Error cancelling job", "error");
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

// Export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = InstagramQueuePanel;
} else if (typeof window !== "undefined") {
  window.InstagramQueuePanel = InstagramQueuePanel;
}
