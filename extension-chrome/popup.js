/**
 * Enhanced popup script v4.0 - Enterprise Edition
 * Features: WebSocket status, live metrics, real-time updates
 */

class EnhancedPopupManager {
  constructor() {
    this.form = document.getElementById("settingsForm");
    this.serverUrlInput = document.getElementById("serverUrl");
    this.saveBtn = document.getElementById("saveBtn");
    this.testBtn = document.getElementById("testBtn");
    this.statusEl = document.getElementById("status");

    // New UI elements
    this.connectionStatus = document.getElementById("connectionStatus");
    this.statusDot = document.getElementById("statusDot");
    this.statusText = document.getElementById("statusText");

    // Metrics elements
    this.metricsElements = {
      queued: document.getElementById("queuedCount"),
      processing: document.getElementById("processingCount"),
      completed: document.getElementById("completedCount"),
      memory: document.getElementById("memoryUsage"),
    };

    // Progress elements
    this.progressElements = {
      workers: {
        progress: document.getElementById("workersProgress"),
        value: document.getElementById("workersValue"),
      },
      queue: {
        progress: document.getElementById("queueProgress"),
        value: document.getElementById("queueValue"),
      },
      memory: {
        progress: document.getElementById("memoryProgress"),
        value: document.getElementById("memoryValue"),
      },
    };

    this.refreshInterval = null;
    this.lastStats = null;
    this.animationFrame = null;

    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadVersion();
    this.setupEventListeners();
    this.startPeriodicUpdates();
    this.updateConnectionStatus();
  }

  async loadSettings() {
    try {
      const data = await chrome.storage.local.get(["serverUrl"]);
      if (data.serverUrl) {
        this.serverUrlInput.value = data.serverUrl;
      }
    } catch (error) {
      this.showStatus("Error loading settings", "error");
    }
  }

  async loadVersion() {
    try {
      const manifest = chrome.runtime.getManifest();
      document.getElementById(
        "version"
      ).textContent = `v${manifest.version} • WebSocket • Memory Processing`;
    } catch (error) {
      document.getElementById("version").textContent = "Version: Unknown";
    }
  }

  async updateConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getConnectionStatus",
      });

      if (response?.success && response.result) {
        const status = response.result;
        this.updateConnectionUI(status);
      } else {
        this.updateConnectionUI({
          webSocketConnected: false,
          serverUrl: this.serverUrlInput.value || "Not configured",
        });
      }
    } catch (error) {
      this.updateConnectionUI({
        webSocketConnected: false,
        serverUrl: "Connection failed",
      });
    }
  }

  updateConnectionUI(status) {
    const isConnected = status.webSocketConnected;

    // Update status dot
    this.statusDot.className = `status-dot ${
      isConnected ? "" : "disconnected"
    }`;

    // Update status text
    if (isConnected) {
      this.statusText.textContent = "WebSocket Connected";
      this.connectionStatus.style.background = "rgba(76, 175, 80, 0.2)";
    } else if (status.pollingActive) {
      this.statusText.textContent = "Polling Mode";
      this.connectionStatus.style.background = "rgba(255, 152, 0, 0.2)";
    } else {
      this.statusText.textContent = "Disconnected";
      this.connectionStatus.style.background = "rgba(244, 67, 54, 0.2)";
    }
  }

  async loadQueueStats(forceRefresh = false) {
    try {
      const serverUrl =
        this.serverUrlInput.value.trim() || "http://localhost:3000";

      const response = await fetch(`${serverUrl}/api/queue/stats`, {
        method: "GET",
        timeout: 5000,
      });

      if (response.ok) {
        const stats = await response.json();
        this.displayQueueStats(stats);
        this.lastStats = stats;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.displayErrorStats(error.message);
    }
  }

  displayQueueStats(stats) {
    // Update metric cards with smooth animations
    this.animateMetricUpdate(this.metricsElements.queued, stats.queued || 0);
    this.animateMetricUpdate(
      this.metricsElements.processing,
      stats.processing || 0
    );
    this.animateMetricUpdate(
      this.metricsElements.completed,
      stats.completed || 0
    );

    // Memory display with formatting
    const memoryText = stats.memoryUsageFormatted || "0 B";
    this.metricsElements.memory.textContent = memoryText;

    // Update progress bars
    this.updateProgressBar(
      "workers",
      stats.activeWorkers || 0,
      stats.maxWorkers || 5,
      `${stats.activeWorkers || 0}/${stats.maxWorkers || 5}`
    );

    this.updateProgressBar(
      "queue",
      stats.queued || 0,
      stats.maxQueueSize || 50,
      `${stats.queued || 0}/${stats.maxQueueSize || 50}`
    );

    this.updateProgressBar(
      "memory",
      stats.memoryUtilization || 0,
      100,
      `${stats.memoryUsageFormatted || "0 B"} / ${
        stats.maxMemoryFormatted || "200 MB"
      }`
    );

    // Update connection status if WebSocket info available
    if (stats.webSocket) {
      this.updateConnectionUI({
        webSocketConnected: stats.realTimeUpdates,
        pollingActive: !stats.realTimeUpdates,
      });
    }
  }

  animateMetricUpdate(element, newValue) {
    const oldValue = parseInt(element.textContent) || 0;

    if (oldValue === newValue) return;

    // Animate number change
    const duration = 500;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(
        oldValue + (newValue - oldValue) * easeOut
      );

      element.textContent = currentValue;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  updateProgressBar(type, current, max, displayText) {
    const progressEl = this.progressElements[type];
    if (!progressEl) return;

    const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;

    // Update progress bar with animation
    progressEl.progress.style.width = `${percentage}%`;
    progressEl.value.textContent = displayText;

    // Update color based on percentage
    const progressBar = progressEl.progress;
    progressBar.className = `progress-fill ${type}`;

    if (percentage > 80) {
      progressBar.classList.add("high");
    }
  }

  displayErrorStats(error) {
    // Reset all metrics to error state
    Object.values(this.metricsElements).forEach((el) => {
      el.textContent = "-";
    });

    Object.values(this.progressElements).forEach((prog) => {
      prog.progress.style.width = "0%";
      prog.value.textContent = "Error";
    });

    console.error("Stats display error:", error);
  }

  startPeriodicUpdates() {
    // Initial load
    this.loadQueueStats();

    // Update every 8 seconds
    this.refreshInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        this.loadQueueStats();
        this.updateConnectionStatus();
      }
    }, 8000);
  }

  setupEventListeners() {
    this.form.addEventListener("submit", (e) => this.handleSave(e));
    this.testBtn.addEventListener("click", () => this.handleTest());

    // New event listeners
    document.getElementById("refreshStats").addEventListener("click", (e) => {
      e.preventDefault();
      this.loadQueueStats(true);
      this.showStatus("Stats refreshed", "success", 1500);
    });

    document.getElementById("openQueue").addEventListener("click", (e) => {
      e.preventDefault();
      this.openQueueInNewTab();
    });

    document.getElementById("openDocs").addEventListener("click", (e) => {
      e.preventDefault();
      this.openDocumentation();
    });

    this.serverUrlInput.addEventListener("input", () =>
      this.validateServerUrl()
    );

    // Auto-refresh on focus
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.loadQueueStats();
        this.updateConnectionStatus();
      }
    });
  }

  async openQueueInNewTab() {
    try {
      const serverUrl =
        this.serverUrlInput.value.trim() || "http://localhost:3000";
      await chrome.tabs.create({ url: `${serverUrl}/health` });
    } catch (error) {
      this.showStatus("Failed to open queue management", "error");
    }
  }

  openDocumentation() {
    chrome.tabs.create({
      url: "https://github.com/revoulce/reels-to-telegram/blob/main/docs/api-reference.md",
    });
  }

  validateServerUrl() {
    const value = this.serverUrlInput.value.trim();
    const errorEl = document.getElementById("serverUrlError");

    if (!value) {
      this.setFieldError(
        this.serverUrlInput,
        errorEl,
        "Server URL is required"
      );
      return false;
    }

    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) {
        this.setFieldError(
          this.serverUrlInput,
          errorEl,
          "URL must start with http:// or https://"
        );
        return false;
      }
    } catch {
      this.setFieldError(this.serverUrlInput, errorEl, "Invalid URL format");
      return false;
    }

    this.clearFieldError(this.serverUrlInput, errorEl);
    return true;
  }

  setFieldError(input, errorEl, message) {
    input.classList.add("error");
    errorEl.textContent = message;
  }

  clearFieldError(input, errorEl) {
    input.classList.remove("error");
    errorEl.textContent = "";
  }

  async handleSave(e) {
    e.preventDefault();

    if (!this.validateForm()) {
      return;
    }

    const serverUrl = this.serverUrlInput.value.trim();

    try {
      this.setButtonLoading(this.saveBtn, true);

      await chrome.storage.local.set({ serverUrl });

      chrome.runtime.sendMessage({
        action: "updateSettings",
        settings: { serverUrl },
      });

      this.showStatus("✅ Configuration saved successfully!", "success");

      // Refresh stats after saving
      setTimeout(() => {
        this.loadQueueStats();
        this.updateConnectionStatus();
      }, 500);
    } catch (error) {
      this.showStatus(`❌ Save failed: ${error.message}`, "error");
    } finally {
      this.setButtonLoading(this.saveBtn, false);
    }
  }

  async handleTest() {
    if (!this.validateForm()) {
      this.showStatus("Fix validation errors first", "error");
      return;
    }

    try {
      this.setButtonLoading(this.testBtn, true);
      this.showStatus("Testing connection and WebSocket...", "info");

      const response = await chrome.runtime.sendMessage({
        action: "testConnection",
      });

      if (response?.success && response.result) {
        const result = response.result;

        const wsStatus = result.webSocketConnected
          ? "🟢 Connected"
          : "🔴 Disconnected";
        const processor = result.processor || "gallery-dl";

        this.showStatus(
          `✅ Connection successful!\nWebSocket: ${wsStatus}\nProcessor: ${processor}\nQueue: ${
            result.queueStats?.queued || 0
          } items`,
          "success",
          4000
        );

        // Update UI with fresh data
        if (result.queueStats) {
          this.displayQueueStats(result.queueStats);
        }

        this.updateConnectionUI({
          webSocketConnected: result.webSocketConnected,
          pollingActive: !result.webSocketConnected,
        });
      } else {
        throw new Error(response?.error || "Connection test failed");
      }
    } catch (error) {
      let errorMessage = `❌ Connection test failed: ${error.message}`;

      if (error.message.includes("Failed to fetch")) {
        errorMessage = "❌ Cannot reach server. Check URL and server status.";
      }

      this.showStatus(errorMessage, "error", 5000);

      this.updateConnectionUI({
        webSocketConnected: false,
        serverUrl: "Connection failed",
      });
    } finally {
      this.setButtonLoading(this.testBtn, false);
    }
  }

  validateForm() {
    return this.validateServerUrl();
  }

  setButtonLoading(button, loading) {
    if (loading) {
      button.disabled = true;
      const originalText = button.textContent;
      button.dataset.originalText = originalText;
      button.innerHTML = '<span class="loading"></span>' + originalText;
    } else {
      button.disabled = false;
      const originalText = button.dataset.originalText || button.textContent;
      button.innerHTML = originalText;
    }
  }

  showStatus(message, type = "info", duration = 3000) {
    this.statusEl.textContent = message;
    this.statusEl.className = `status-card ${type} show`;

    setTimeout(() => {
      this.statusEl.classList.remove("show");
    }, duration);
  }

  // Cleanup on unload
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const popupManager = new EnhancedPopupManager();

  // Cleanup on window unload
  window.addEventListener("beforeunload", () => {
    popupManager.destroy();
  });

  // Make globally available for debugging
  window.popupManager = popupManager;
});

// Also initialize if DOM is already loaded
if (document.readyState !== "loading") {
  const popupManager = new EnhancedPopupManager();
  window.popupManager = popupManager;
}
