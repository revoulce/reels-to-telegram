const config = require("../config");
const { validatePageData } = require("../utils/validation");

/**
 * Video Controller - handles content processing API endpoints
 */
class VideoController {
  constructor(videoQueue) {
    this.videoQueue = videoQueue;
  }

  /**
   * POST /api/download-video
   * Add content to processing queue
   */
  async downloadMedia(req, res) {
    const { pageUrl, timestamp } = req.body;

    console.log("\n🚀 New content request:", {
      pageUrl,
      timestamp,
      ip: req.ip,
    });

    try {
      // Validate page data
      const pageData = { pageUrl, timestamp };
      validatePageData(pageData);

      const jobId = this.videoQueue.addJob(pageData, {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        requestTime: new Date(),
      });

      const queueStats = this.videoQueue.getQueueStats();

      res.json({
        success: true,
        jobId,
        message: "Content added to processing queue",
        queuePosition: queueStats.queued,
        estimatedWaitTime:
          Math.ceil(queueStats.queued / config.MAX_CONCURRENT_DOWNLOADS) * 45, // Увеличили время так как gallery-dl может быть медленнее
        processing: {
          mode: "memory",
          zeroDiskUsage: true,
          currentMemoryUsage: queueStats.memoryUsageFormatted,
          memoryUtilization: queueStats.memoryUtilization,
          processor: "gallery-dl",
        },
      });
    } catch (error) {
      console.error("❌ Error adding to queue:", error.message);

      const statusCode = error.message.includes("Queue is full")
        ? 503
        : error.message.includes("Memory")
        ? 507
        : error.message.includes("Invalid")
        ? 400
        : 500;

      res.status(statusCode).json({
        success: false,
        error: error.message,
        ...(statusCode === 507 && {
          memoryInfo: {
            current: this.formatMemory(
              this.videoQueue.memoryManager.currentUsage
            ),
            max: this.formatMemory(config.MAX_TOTAL_MEMORY),
            utilization: Math.round(
              (this.videoQueue.memoryManager.currentUsage /
                config.MAX_TOTAL_MEMORY) *
                100
            ),
          },
        }),
      });
    }
  }

  /**
   * GET /api/job/:jobId
   * Get job status
   */
  async getJobStatus(req, res) {
    const { jobId } = req.params;
    const jobStatus = this.videoQueue.getJobStatus(jobId);

    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    const response = {
      jobId,
      status: jobStatus.status,
      progress: jobStatus.progress || 0,
      progressMessage: jobStatus.progressMessage,
      addedAt: jobStatus.addedAt,
      startedAt: jobStatus.startedAt,
      completedAt: jobStatus.completedAt,
      failedAt: jobStatus.failedAt,
      processing: {
        mode: "memory",
        processor: "gallery-dl",
      },
    };

    if (jobStatus.status === "completed") {
      response.result = jobStatus.result;
    }

    if (jobStatus.status === "failed") {
      response.error = jobStatus.error;
    }

    res.json(response);
  }

  /**
   * DELETE /api/job/:jobId
   * Cancel job
   */
  async cancelJob(req, res) {
    const { jobId } = req.params;
    const cancelled = this.videoQueue.cancelJob(jobId);

    res.json({
      success: cancelled,
      message: cancelled
        ? "Job cancelled successfully"
        : "Job cannot be cancelled (not in queue or already processing)",
    });
  }

  /**
   * Format memory helper
   * @param {number} bytes
   * @returns {string}
   */
  formatMemory(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

module.exports = VideoController;
