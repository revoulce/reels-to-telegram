const config = require('../config');

/**
 * Video Controller - handles video-related API endpoints
 */
class VideoController {
  constructor(videoQueue) {
    this.videoQueue = videoQueue;
  }

  /**
   * POST /api/download-video
   * Add video to processing queue
   */
  async downloadMedia(req, res) {
    const { mediaUrl, pageUrl, timestamp, mediaType } = req.body;

    console.log("\n🚀 New media request for memory processing:", {
      pageUrl,
      hasVideoUrl: !!mediaUrl,
      timestamp,
      ip: req.ip,
    });

    try {
      const jobId = this.videoQueue.addJob(
        { mediaUrl, pageUrl, timestamp, mediaType },
        {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          requestTime: new Date(),
        }
      );

      const queueStats = this.videoQueue.getQueueStats();

      res.json({
        success: true,
        jobId,
        message: "Media added to in-memory processing queue",
        queuePosition: queueStats.queued,
        estimatedWaitTime:
          Math.ceil(queueStats.queued / config.MAX_CONCURRENT_DOWNLOADS) * 30,
        processing: {
          mode: "memory",
          zeroDiskUsage: true,
          currentMemoryUsage: queueStats.memoryUsageFormatted,
          memoryUtilization: queueStats.memoryUtilization,
        },
      });
    } catch (error) {
      console.error("❌ Error adding to memory queue:", error.message);

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
            current: this.videoQueue.memoryManager.formatMemory(
              this.videoQueue.memoryManager.currentUsage
            ),
            max: this.videoQueue.memoryManager.formatMemory(
              config.MAX_TOTAL_MEMORY
            ),
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
        estimatedSize: jobStatus.estimatedSize,
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
}

module.exports = VideoController;
