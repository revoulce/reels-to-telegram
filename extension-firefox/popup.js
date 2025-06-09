/**
 * Enhanced popup script v4.0 for Firefox without authentication
 */

// Firefox compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

class PopupManagerFirefox {
  constructor() {
    this.form = document.getElementById("settingsForm");
    this.serverUrlInput = document.getElementById("serverUrl");
    this.saveBtn = document.getElementById("saveBtn");
    this.testBtn = document.getElementById("testBtn");
    this.statusEl = document.getElementById("status");

    this.queueStatsInterval = null;

    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadVersion();
    this.setupEventListeners();
    this.startPeriodicUpdates();
  }

  async loadSettings() {
    try {
      const data = await browserAPI.storage.local.get(["serverUrl"]);

      if (data.serverUrl) {
        this.serverUrlInput.value = data.serverUrl;
      }
    } catch (error) {
      this.showStatus("Error loading settings", "error");
    }
  }

  async loadVersion() {
    try {
      const manifest = browserAPI.runtime.getManifest();
      document.getElementById(
        "version"
      ).textContent = `Version: ${manifest.version} (Firefox WebSocket)`;
    } catch (error) {
      document.getElementById("version").textContent = "Version: Unknown";
    }
  }

  async loadQueueStats(forceRefresh = false) {
    const queueStatsEl = document.getElementById("queueStats");

    if (forceRefresh) {
      queueStatsEl.innerHTML =
        '<div style="color: #2196F3;">🔄 Refreshing...</div>';
    }

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
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      queueStatsEl.innerHTML = `
                <div style="color: #f44336;">
                    ❌ Error: ${error.message}
                </div>
            `;
    }
  }

  displayQueueStats(stats) {
    const queueStatsEl = document.getElementById("queueStats");

    const queueUtilization =
      stats.maxQueueSize > 0
        ? Math.round((stats.queued / stats.maxQueueSize) * 100)
        : 0;

    const workerUtilization =
      stats.maxWorkers > 0
        ? Math.round((stats.activeWorkers / stats.maxWorkers) * 100)
        : 0;

    const memoryInfo = stats.memoryUsageFormatted
      ? `${stats.memoryUsageFormatted} / ${stats.maxMemoryFormatted} (${stats.memoryUtilization}%)`
      : "N/A";

    queueStatsEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #333; font-size: 11px;">⏳ QUEUED</div>
                    <div style="font-size: 20px; color: #FF9800; font-weight: bold;">${
                      stats.queued
                    }</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #333; font-size: 11px;">🔄 PROCESSING</div>
                    <div style="font-size: 20px; color: #2196F3; font-weight: bold;">${
                      stats.processing
                    }</div>
                </div>
            </div>

            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #333; font-size: 11px;">👷 WORKERS</span>
                    <span style="font-size: 10px; color: #666;">${
                      stats.activeWorkers
                    }/${stats.maxWorkers}</span>
                </div>
                <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                    <div style="
                        background: ${this.getUtilizationColor(
                          workerUtilization
                        )};
                        height: 100%;
                        width: ${workerUtilization}%;
                        transition: width 0.3s ease;
                    "></div>
                </div>
            </div>

            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #333; font-size: 11px;">📊 QUEUE CAPACITY</span>
                    <span style="font-size: 10px; color: #666;">${
                      stats.queued
                    }/${stats.maxQueueSize}</span>
                </div>
                <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                    <div style="
                        background: ${this.getUtilizationColor(
                          queueUtilization
                        )};
                        height: 100%;
                        width: ${queueUtilization}%;
                        transition: width 0.3s ease;
                    "></div>
                </div>
            </div>

            ${
              stats.memoryUsageFormatted
                ? `
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #333; font-size: 11px;">💾 MEMORY</span>
                        <span style="font-size: 10px; color: #666;">${memoryInfo}</span>
                    </div>
                    <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                        <div style="
                            background: ${this.getUtilizationColor(
                              stats.memoryUtilization
                            )};
                            height: 100%;
                            width: ${stats.memoryUtilization}%;
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                </div>
            `
                : ""
            }

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px; color: #666; margin-top: 12px;">
                <div>✅ Completed: ${stats.completed}</div>
                <div>❌ Failed: ${stats.failed}</div>
                ${
                  stats.throughputPerMinute
                    ? `<div>📈 Rate: ${stats.throughputPerMinute.toFixed(
                        1
                      )}/min</div>`
                    : ""
                }
                ${
                  stats.uptime
                    ? `<div>⏱ Uptime: ${Math.floor(
                        stats.uptime / 3600
                      )}h ${Math.floor((stats.uptime % 3600) / 60)}m</div>`
                    : ""
                }
            </div>

            ${this.getQueueStatusMessage(stats)}
        `;
  }

  getUtilizationColor(percentage) {
    if (percentage > 80) return "#f44336";
    if (percentage > 60) return "#FF9800";
    if (percentage > 30) return "#FFC107";
    return "#4CAF50";
  }

  getQueueStatusMessage(stats) {
    if (stats.queued === 0 && stats.processing === 0) {
      return '<div style="margin-top: 10px; padding: 8px; background: #e8f5e8; color: #2e7d2e; border-radius: 4px; font-size: 11px; text-align: center;">🎉 Queue is empty • Ready for new videos!</div>';
    }

    if (stats.activeWorkers === stats.maxWorkers) {
      const estimatedTime = Math.ceil(stats.queued / stats.maxWorkers) * 30;
      return `<div style="margin-top: 10px; padding: 8px; background: #fff3cd; color: #856404; border-radius: 4px; font-size: 11px; text-align: center;">⚡ All workers busy • Est. wait: ${estimatedTime}s</div>`;
    }

    if (stats.queued > stats.maxQueueSize * 0.8) {
      return '<div style="margin-top: 10px; padding: 8px; background: #f8d7da; color: #721c24; border-radius: 4px; font-size: 11px; text-align: center;">⚠️ Queue nearly full</div>';
    }

    return '<div style="margin-top: 10px; padding: 8px; background: #d1ecf1; color: #0c5460; border-radius: 4px; font-size: 11px; text-align: center;">📤 Ready to accept new videos</div>';
  }

  startPeriodicUpdates() {
    this.queueStatsInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        this.loadQueueStats();
      }
    }, 10000);
  }

  setupEventListeners() {
    this.form.addEventListener("submit", (e) => this.handleSave(e));
    this.testBtn.addEventListener("click", () => this.handleTest());

    this.serverUrlInput.addEventListener("input", () =>
      this.validateServerUrl()
    );
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

      await browserAPI.storage.local.set({ serverUrl });

      browserAPI.runtime.sendMessage({
        action: "updateSettings",
        settings: { serverUrl },
      });

      this.showStatus("✅ Settings saved!", "success");
      setTimeout(() => this.loadQueueStats(), 500);
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
      this.showStatus("Testing connection...", "info");

      const response = await browserAPI.runtime.sendMessage({
        action: "testConnection",
      });

      if (response.success) {
        const result = response.result;
        this.showStatus(
          `✅ Connection successful! WebSocket: ${
            result.webSocketConnected ? "Connected" : "Disconnected"
          }, Queue: ${result.queueStats.queued} items`,
          "success"
        );

        this.displayQueueStats(result.queueStats);
      } else {
        throw new Error(response.error || "Connection test failed");
      }
    } catch (error) {
      if (error.message.includes("Failed to fetch")) {
        this.showStatus(
          "❌ Cannot reach server. Check URL and server status.",
          "error"
        );
      } else {
        this.showStatus(`❌ Connection failed: ${error.message}`, "error");
      }
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

  showStatus(message, type = "info") {
    this.statusEl.textContent = message;
    this.statusEl.className = `status-card ${type} show`;

    setTimeout(() => {
      this.statusEl.classList.remove("show");
    }, 5000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const popupManagerFirefox = new PopupManagerFirefox();

  window.addEventListener("beforeunload", () => {
    if (popupManagerFirefox.queueStatsInterval) {
      clearInterval(popupManagerFirefox.queueStatsInterval);
    }
  });

  window.popupManagerFirefox = popupManagerFirefox;
});
