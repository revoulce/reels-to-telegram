const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { promisify } = require("util");
const { exec } = require("child_process");

// Configuration and utilities
const config = require("./config");

// Services
const WebSocketService = require("./services/WebSocketService");

// Middleware
const { requestLogger, errorLogger } = require("./middleware/logging");

// Core components
const VideoQueue = require("./queue/VideoQueue");

// Controllers
const VideoController = require("./controllers/VideoController");
const StatsController = require("./controllers/StatsController");

// Validation utilities
const { validatePageData } = require("./utils/validation");

const execAsync = promisify(exec);

/**
 * Main Server Class with WebSocket support
 * Simplified gallery-dl only approach
 */
class Server {
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);

    // Services
    this.webSocketService = null;
    this.videoQueue = null;

    // Controllers
    this.videoController = null;
    this.statsController = null;

    this.setupExpress();
  }

  /**
   * Setup Express app with middleware
   */
  setupExpress() {
    // CORS configuration
    this.app.use(
      cors({
        origin: ["https://www.instagram.com", "chrome-extension://*"],
        credentials: true,
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: "10mb" }));

    // Request logging
    this.app.use(requestLogger);

    console.log("⚙️ Express middleware configured");
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health endpoints (no auth required)
    this.app.get("/health", (req, res) =>
      this.statsController.getHealth(req, res)
    );
    this.app.get("/api/health", (req, res) =>
      this.statsController.getApiHealth(req, res)
    );

    // Content processing endpoints
    this.app.post("/api/download-video", (req, res) => {
      // Validate request body
      try {
        validatePageData(req.body);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      this.videoController.downloadMedia(req, res);
    });

    this.app.get("/api/job/:jobId", (req, res) =>
      this.videoController.getJobStatus(req, res)
    );
    this.app.delete("/api/job/:jobId", (req, res) =>
      this.videoController.cancelJob(req, res)
    );

    // Statistics endpoints
    this.app.get("/api/queue/stats", (req, res) =>
      this.statsController.getQueueStats(req, res)
    );
    this.app.get("/api/queue/jobs", (req, res) =>
      this.statsController.getQueueJobs(req, res)
    );
    this.app.get("/api/stats", (req, res) =>
      this.statsController.getStats(req, res)
    );

    // WebSocket statistics
    this.app.get("/api/websocket/stats", (req, res) => {
      const stats = this.webSocketService.getStats();
      res.json({ success: true, ...stats });
    });

    // Error handling middleware
    this.app.use(errorLogger);

    console.log("🛣️ API routes configured");
  }

  /**
   * Initialize core components
   */
  async initializeComponents() {
    // Initialize WebSocket service
    this.webSocketService = new WebSocketService(this.httpServer);

    // Initialize video queue with WebSocket support
    this.videoQueue = new VideoQueue(this.webSocketService);

    // Initialize controllers
    this.videoController = new VideoController(this.videoQueue);
    this.statsController = new StatsController(this.videoQueue);

    // Setup event listeners
    this.setupEventListeners();

    console.log("🧩 Core components initialized with gallery-dl processor");
  }

  /**
   * Setup event listeners for monitoring
   */
  setupEventListeners() {
    this.videoQueue.on("jobAdded", (job) => {
      console.log(`📥 Job ${job.id.substring(0, 8)} added to queue`);
    });

    this.videoQueue.on("jobCompleted", (jobId, result) => {
      console.log(
        `✅ Job ${jobId.substring(0, 8)} completed in ${
          result.processingTime
        }ms with ${result.processor}`
      );
    });

    this.videoQueue.on("jobFailed", (jobId, error) => {
      console.error(`❌ Job ${jobId.substring(0, 8)} failed: ${error.message}`);
    });

    this.videoQueue.on("memoryAllocated", (jobId, bytes, total) => {
      if (config.DEBUG_MEMORY) {
        console.log(
          `💾 Memory allocated for ${jobId.substring(
            0,
            8
          )}: ${this.formatMemory(bytes)} (total: ${this.formatMemory(total)})`
        );
      }
    });

    this.videoQueue.on("memoryFreed", (jobId, bytes, total) => {
      if (config.DEBUG_MEMORY) {
        console.log(
          `💾 Memory freed for ${jobId.substring(0, 8)}: ${this.formatMemory(
            bytes
          )} (total: ${this.formatMemory(total)})`
        );
      }
    });

    // WebSocket connection events
    if (this.webSocketService) {
      setInterval(() => {
        const wsStats = this.webSocketService.getStats();
        if (wsStats.totalConnections > 0) {
          console.log(
            `🔌 WebSocket: ${wsStats.totalConnections} connections, ${wsStats.totalJobSubscriptions} job subscriptions`
          );
        }
      }, 5 * 60 * 1000); // Every 5 minutes
    }
  }

  /**
   * Validate dependencies
   */
  async validateDependencies() {
    try {
      await execAsync("gallery-dl --version");
      console.log("✅ gallery-dl found");
    } catch (error) {
      throw new Error(
        "gallery-dl not found. Please install: pip install gallery-dl"
      );
    }

    // Check for optional cookies file
    try {
      const fs = require("fs");
      if (fs.existsSync("./cookies.txt")) {
        console.log("✅ cookies.txt found");
      } else {
        console.warn("⚠️ cookies.txt not found, some private content may fail");
      }
    } catch (error) {
      console.warn("⚠️ Could not check for cookies.txt");
    }
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Validate dependencies
      await this.validateDependencies();

      // Initialize components
      await this.initializeComponents();

      // Setup routes
      this.setupRoutes();

      // Start HTTP + WebSocket server
      this.httpServer.listen(config.PORT, () => {
        console.log(
          `🚀 Server running on port ${config.PORT} with gallery-dl processor`
        );
        console.log(`📺 Telegram channel: ${config.CHANNEL_ID}`);
        console.log(
          `⚡ Queue: max ${config.MAX_CONCURRENT_DOWNLOADS} concurrent, ${config.MAX_QUEUE_SIZE} queue size`
        );
        console.log(
          `💾 Memory limits: ${this.formatMemory(
            config.MAX_MEMORY_PER_VIDEO
          )} per item, ${this.formatMemory(config.MAX_TOTAL_MEMORY)} total`
        );
        console.log(`🔌 WebSocket: Real-time updates enabled at /ws`);
        console.log(`📦 Processor: gallery-dl with JSON metadata extraction`);
        console.log(`🚀 Zero disk usage mode enabled!`);
        console.log(
          `🔧 Debug memory: ${config.DEBUG_MEMORY ? "enabled" : "disabled"}`
        );
        console.log("");
        console.log("📖 API Documentation:");
        console.log(`   Health: http://localhost:${config.PORT}/health`);
        console.log(`   WebSocket: ws://localhost:${config.PORT}/ws`);
        console.log(
          `   Queue Stats: http://localhost:${config.PORT}/api/queue/stats`
        );
      });

      // Start Telegram bot
      await this.videoQueue.launch();

      // Log system information
      this.logSystemInfo();

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      console.error("❌ Failed to start server:", error.message);

      if (error.message.includes("gallery-dl")) {
        console.log("\n💡 Install gallery-dl:");
        console.log("   pip install gallery-dl");
        console.log("   # or");
        console.log("   pip install -U gallery-dl  # to update");
        console.log("");
        console.log("💡 For Instagram support, also create cookies.txt:");
        console.log("   1. Install browser extension like 'cookies.txt'");
        console.log("   2. Export Instagram cookies to cookies.txt");
        console.log("   3. Place cookies.txt in server root directory");
      }

      process.exit(1);
    }
  }

  /**
   * Log system information
   */
  logSystemInfo() {
    const os = require("os");
    const systemMem = os.totalmem();
    const freeMem = os.freemem();

    console.log(
      `💻 System: ${this.formatMemory(freeMem)} free / ${this.formatMemory(
        systemMem
      )} total RAM`
    );

    if (freeMem < config.MAX_TOTAL_MEMORY * 2) {
      console.warn(
        `⚠️ Warning: Low system memory. Consider reducing MAX_TOTAL_MEMORY.`
      );
    }

    console.log(`📦 Content processor: gallery-dl (unified approach)`);
    console.log(
      `📊 Metadata extraction: JSON from gallery-dl --write-info-json`
    );
    console.log(`🎯 Supported content: Reels, Posts, Stories (all types)`);
  }

  /**
   * Setup graceful shutdown handling
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);

      try {
        if (this.videoQueue) {
          const memoryStats = this.videoQueue.memoryManager.getStats();
          const queueStats = this.videoQueue.getQueueStats();

          console.log(`💾 Memory at shutdown: ${memoryStats.currentFormatted}`);
          console.log(`📊 Total processed: ${queueStats.totalProcessed}`);
          console.log(`📦 Processor used: ${queueStats.processor}`);

          await this.videoQueue.shutdown();
        }

        console.log("✅ Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }

  /**
   * Format memory helper
   */
  formatMemory(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

// Create and start server
const server = new Server();
server.start();
