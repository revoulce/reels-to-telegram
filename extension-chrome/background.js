/**
 * Enhanced background script v4.1 with simplified URL-only approach
 * No media detection, just page URL processing
 */

importScripts("js/socket.io.min.js", "js/websocket-client.js");

const CONFIG = {
  DEFAULT_SERVER_URL: "http://localhost:3000",
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  TIMEOUT: 30000,
  POLLING_INTERVAL: 8000,
};

class BackgroundService {
  constructor() {
    this.activeJobs = new Map();
    this.webSocketClient = new WebSocketClient();
    this.pollingInterval = null;
    this.settings = { serverUrl: "" };

    this.setupMessageListener();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const data = await chrome.storage.local.get(["serverUrl"]);
      this.settings = {
        serverUrl: data.serverUrl || CONFIG.DEFAULT_SERVER_URL,
      };

      await this.initializeWebSocket();
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("📨 Background received message:", request.action);

      const handler = this.getMessageHandler(request.action);

      if (handler) {
        handler(request)
          .then((result) => {
            console.log("✅ Background handler success:", result);
            sendResponse({ success: true, result });
          })
          .catch((error) => {
            console.error("❌ Background handler error:", error);
            sendResponse({
              success: false,
              error: error.message || "Unknown error",
            });
          });
        return true; // Важно! Указывает что ответ будет асинхронным
      } else {
        console.warn("❓ Unknown action:", request.action);
        sendResponse({
          success: false,
          error: "Unknown action",
        });
      }
    });
  }

  getMessageHandler(action) {
    const handlers = {
      sendToTelegram: (req) => this.handleContentSend(req.data),
      getJobStatus: (req) => this.getJobStatus(req.jobId),
      cancelJob: (req) => this.cancelJob(req.jobId),
      updateSettings: (req) => this.handleSettingsUpdate(req.settings),
      getConnectionStatus: () => this.getConnectionStatus(),
      testConnection: () => this.testConnection(),
    };

    return handlers[action];
  }

  /**
   * Initialize WebSocket connection
   */
  async initializeWebSocket() {
    try {
      this.webSocketClient.initialize(this.settings.serverUrl);
      this.setupWebSocketEventListeners();
      await this.webSocketClient.connect();
    } catch (error) {
      console.error("Failed to initialize WebSocket:", error);
    }
  }

  setupWebSocketEventListeners() {
    this.webSocketClient.on("connected", () => {
      console.log("🔌 WebSocket connected, subscribing to queue updates");
      this.webSocketClient.subscribeToQueue();
      this.broadcastConnectionStatus(true);
      this.stopPollingFallback();
    });

    this.webSocketClient.on("disconnected", () => {
      console.log("🔌 WebSocket disconnected");
      this.broadcastConnectionStatus(false);
      this.startPollingFallback();
    });

    this.webSocketClient.on("jobProgress", (jobId, progress, message) => {
      this.handleJobProgress(jobId, {
        status: "processing",
        progress,
        progressMessage: message,
      });
    });

    this.webSocketClient.on("jobFinished", (jobId, status, result, error) => {
      this.handleJobFinished(jobId, status, { result, error });
    });

    this.webSocketClient.on("queueStats", (stats) => {
      this.broadcastToTabs("queueStatsUpdate", stats);
    });

    this.webSocketClient.on("maxReconnectAttemptsReached", () => {
      console.error(
        "WebSocket max reconnect attempts reached, enabling polling fallback"
      );
      this.broadcastConnectionStatus(
        false,
        "WebSocket unavailable, using polling"
      );
      this.startPollingFallback();
    });
  }

  startPollingFallback() {
    if (this.pollingInterval) return;

    console.log("📡 Starting HTTP polling fallback");

    this.pollingInterval = setInterval(async () => {
      const jobIds = Array.from(this.activeJobs.keys());
      if (jobIds.length === 0) return;

      const batchSize = 3;
      for (let i = 0; i < jobIds.length; i += batchSize) {
        const batch = jobIds.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (jobId) => {
            try {
              const status = await this.getJobStatus(jobId);

              if (status.status === "completed") {
                this.handleJobFinished(jobId, "completed", {
                  result: status.result,
                });
              } else if (status.status === "failed") {
                this.handleJobFinished(jobId, "failed", {
                  error: status.error,
                });
              } else if (status.status === "processing") {
                this.handleJobProgress(jobId, {
                  status: "processing",
                  progress: status.progress,
                  progressMessage: status.progressMessage,
                });
              }
            } catch (error) {
              console.error(`Polling failed for job ${jobId}:`, error);
            }
          })
        );

        if (i + batchSize < jobIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }, CONFIG.POLLING_INTERVAL);
  }

  stopPollingFallback() {
    if (this.pollingInterval) {
      console.log("📡 Stopping HTTP polling fallback");
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async handleSettingsUpdate(newSettings) {
    const oldSettings = { ...this.settings };
    this.settings = { ...newSettings };

    if (oldSettings.serverUrl !== newSettings.serverUrl) {
      this.stopPollingFallback();
      this.webSocketClient.disconnect();
      await this.initializeWebSocket();
    }
  }

  async handleContentSend(pageData) {
    try {
      console.log("🚀 Background: Processing content send...", pageData);

      this.validatePageData(pageData);

      const requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageUrl: pageData.pageUrl,
          timestamp: pageData.timestamp || new Date().toISOString(),
        }),
      };

      const response = await this.fetchWithRetry(
        `${this.settings.serverUrl}/api/download-video`,
        requestOptions
      );

      const result = await response.json();
      console.log("📊 Server response:", result);

      if (!result.success || !result.jobId) {
        throw new Error(result.error || "Failed to add content to queue");
      }

      const jobInfo = {
        jobId: result.jobId,
        pageData,
        queuePosition: result.queuePosition,
        estimatedWaitTime: result.estimatedWaitTime,
        startedAt: new Date(),
      };

      this.activeJobs.set(result.jobId, jobInfo);

      if (this.webSocketClient.isConnected()) {
        this.webSocketClient.subscribeToJob(result.jobId);
      }

      console.log("✅ Background: Content send completed successfully");

      return {
        jobId: result.jobId,
        message: result.message,
        queuePosition: result.queuePosition,
        estimatedWaitTime: result.estimatedWaitTime,
        realTimeUpdates: this.webSocketClient.isConnected(),
        processor: result.processing?.processor || "gallery-dl",
        memoryProcessing: result.processing?.mode === "memory",
      };
    } catch (error) {
      console.error("❌ Background: Content send failed:", error);
      throw new Error(this.getUserFriendlyError(error));
    }
  }

  async getJobStatus(jobId) {
    try {
      const response = await this.fetchWithRetry(
        `${this.settings.serverUrl}/api/job/${jobId}`,
        { method: "GET" }
      );

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to get job status: ${error.message}`);
    }
  }

  async cancelJob(jobId) {
    try {
      const response = await this.fetchWithRetry(
        `${this.settings.serverUrl}/api/job/${jobId}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (result.success) {
        this.cleanupJob(jobId, "cancelled");
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to cancel job: ${error.message}`);
    }
  }

  getConnectionStatus() {
    return {
      webSocketConnected: this.webSocketClient.isConnected(),
      webSocketState: this.webSocketClient.getConnectionState(),
      webSocketStats: this.webSocketClient.getStats(),
      serverUrl: this.settings.serverUrl,
      pollingActive: !!this.pollingInterval,
      pollingInterval: CONFIG.POLLING_INTERVAL,
      processor: "gallery-dl",
    };
  }

  async testConnection() {
    try {
      if (!this.webSocketClient.isConnected()) {
        await this.initializeWebSocket();
      }

      const response = await this.fetchWithRetry(
        `${this.settings.serverUrl}/api/queue/stats`,
        { method: "GET" }
      );

      const data = await response.json();

      return {
        success: true,
        message: "Connection test successful",
        queueStats: data,
        webSocketConnected: this.webSocketClient.isConnected(),
        processor: data.processor || "gallery-dl",
      };
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  async fetchWithRetry(url, options, maxRetries = CONFIG.RETRY_ATTEMPTS) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        const errorText = await response.text();
        throw new Error(`Server error ${response.status}: ${errorText}`);
      } catch (error) {
        lastError = error;

        if (error.name === "AbortError") {
          throw new Error("Request timeout");
        }

        if (i === maxRetries - 1) {
          throw error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.RETRY_DELAY * Math.pow(2, i))
        );
      }
    }

    throw lastError;
  }

  handleJobProgress(jobId, status) {
    this.broadcastToTabs("jobProgress", { jobId, status });
  }

  handleJobFinished(jobId, reason, details = {}) {
    const jobInfo = this.activeJobs.get(jobId);
    if (!jobInfo) return;

    console.log(`🏁 Job ${jobId.substring(0, 8)} finished: ${reason}`);

    this.webSocketClient.unsubscribeFromJob(jobId);
    this.broadcastToTabs("jobFinished", { jobId, reason, details });

    setTimeout(() => {
      this.activeJobs.delete(jobId);
    }, 30000);
  }

  cleanupJob(jobId, reason, details = {}) {
    this.webSocketClient.unsubscribeFromJob(jobId);
    this.broadcastToTabs("jobFinished", { jobId, reason, details });
    this.activeJobs.delete(jobId);
  }

  broadcastConnectionStatus(isConnected, message = "") {
    this.broadcastToTabs("connectionStatusChanged", {
      isConnected,
      message,
      webSocketState: this.webSocketClient.getConnectionState(),
    });
  }

  broadcastToTabs(action, data) {
    chrome.tabs.query({ url: "*://www.instagram.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action, ...data }).catch(() => {
          // Ignore errors
        });
      });
    });
  }

  validatePageData(pageData) {
    console.log("🔍 Validating page data:", pageData);

    if (!pageData) {
      throw new Error("Page data is required");
    }

    if (!pageData.pageUrl) {
      throw new Error("Page URL is required");
    }

    if (!pageData.pageUrl.includes("instagram.com")) {
      throw new Error("Invalid Instagram URL");
    }

    // Дополнительная проверка на валидные пути
    const validPaths = ["/reels/", "/reel/", "/stories/", "/p/"]; // Support both forms
    const hasValidPath = validPaths.some((path) =>
      pageData.pageUrl.includes(path)
    );

    if (!hasValidPath) {
      throw new Error(
        "URL must contain /reels/, /reel/, /stories/, or /p/ path"
      );
    }

    console.log("✅ Page data validation passed");
  }

  getUserFriendlyError(error) {
    const message = error.message || error.toString();

    if (
      message.includes("Failed to fetch") ||
      message.includes("NetworkError")
    ) {
      return "Network error. Check internet connection and server status.";
    }

    if (message.includes("Queue is full")) {
      return "Queue is full. Please try again later.";
    }

    if (message.includes("timeout")) {
      return "Server timeout. Please try again.";
    }

    if (message.includes("Invalid Instagram URL")) {
      return "Invalid Instagram page. Please open a reel, post, or story.";
    }

    return message;
  }
}

// Initialize background service
const backgroundService = new BackgroundService();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.serverUrl) {
    const newSettings = { serverUrl: changes.serverUrl.newValue };
    backgroundService.handleSettingsUpdate(newSettings);
  }
});

chrome.runtime.onSuspend.addListener(() => {
  backgroundService.webSocketClient.disconnect();
  backgroundService.stopPollingFallback();
});

if (typeof globalThis !== "undefined") {
  globalThis.backgroundService = backgroundService;
}
