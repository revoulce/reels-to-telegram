const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const { validatePageData } = require("../utils/validation");

/**
 * Job Manager - handles job lifecycle and state management
 */
class JobManager extends EventEmitter {
  constructor() {
    super();

    // Job storage maps
    this.queue = new Map(); // Pending jobs
    this.processing = new Map(); // Active jobs
    this.completed = new Map(); // Completed jobs
    this.failed = new Map(); // Failed jobs

    // Statistics
    this.totalProcessed = 0;
    this.startTime = Date.now();

    // Initialize cleanup scheduler
    this.initializeCleanup();

    console.log("📋 JobManager initialized");
  }

  /**
   * Add new job to queue
   * @param {object} pageData
   * @param {object} userInfo
   * @returns {string} jobId
   */
  addJob(pageData, userInfo = {}) {
    // Validate input
    validatePageData(pageData);

    // Check queue capacity
    if (this.queue.size >= config.MAX_QUEUE_SIZE) {
      throw new Error(
        `Queue is full (${this.queue.size}/${config.MAX_QUEUE_SIZE}). Please try again later.`
      );
    }

    const jobId = uuidv4();
    const job = {
      id: jobId,
      pageData,
      userInfo,
      addedAt: new Date(),
      status: "queued",
      progress: 0,
    };

    this.queue.set(jobId, job);
    this.emit("jobAdded", job);

    console.log(
      `📥 Job ${jobId.substring(0, 8)} added to queue (${
        this.queue.size
      } queued)`
    );

    return jobId;
  }

  /**
   * Get next job from queue
   * @returns {object|null}
   */
  getNextJob() {
    if (this.queue.size === 0) return null;

    const [jobId, job] = this.queue.entries().next().value;
    this.queue.delete(jobId);

    // Move to processing
    const processingJob = {
      ...job,
      status: "processing",
      startedAt: new Date(),
    };

    this.processing.set(jobId, processingJob);
    this.emit("jobStarted", processingJob);

    return processingJob;
  }

  /**
   * Update job progress
   * @param {string} jobId
   * @param {number} progress
   * @param {string} message
   */
  updateJobProgress(jobId, progress, message) {
    const job = this.processing.get(jobId);
    if (!job) return;

    job.progress = progress;
    job.progressMessage = message;
    job.lastUpdated = new Date();

    this.emit("jobProgress", jobId, progress, message);
  }

  /**
   * Mark job as completed
   * @param {string} jobId
   * @param {object} result
   */
  completeJob(jobId, result) {
    const job = this.processing.get(jobId);
    if (!job) return;

    this.processing.delete(jobId);

    const completedJob = {
      ...job,
      status: "completed",
      result,
      completedAt: new Date(),
    };

    this.completed.set(jobId, completedJob);
    this.totalProcessed++;

    this.emit("jobCompleted", jobId, result);

    console.log(`✅ Job ${jobId.substring(0, 8)} completed`);
  }

  /**
   * Mark job as failed
   * @param {string} jobId
   * @param {Error} error
   */
  failJob(jobId, error) {
    const job = this.processing.get(jobId);
    if (!job) return;

    this.processing.delete(jobId);

    const failedJob = {
      ...job,
      status: "failed",
      error: error.message,
      failedAt: new Date(),
    };

    this.failed.set(jobId, failedJob);

    this.emit("jobFailed", jobId, error);

    console.error(`❌ Job ${jobId.substring(0, 8)} failed: ${error.message}`);
  }

  /**
   * Cancel job (only if in queue)
   * @param {string} jobId
   * @returns {boolean}
   */
  cancelJob(jobId) {
    if (this.queue.has(jobId)) {
      this.queue.delete(jobId);
      this.emit("jobCancelled", jobId);
      console.log(`❌ Job ${jobId.substring(0, 8)} cancelled`);
      return true;
    }
    return false;
  }

  /**
   * Get job status
   * @param {string} jobId
   * @returns {object|null}
   */
  getJobStatus(jobId) {
    if (this.queue.has(jobId)) {
      return { status: "queued", ...this.queue.get(jobId) };
    }
    if (this.processing.has(jobId)) {
      return { status: "processing", ...this.processing.get(jobId) };
    }
    if (this.completed.has(jobId)) {
      return { status: "completed", ...this.completed.get(jobId) };
    }
    if (this.failed.has(jobId)) {
      return { status: "failed", ...this.failed.get(jobId) };
    }
    return null;
  }

  /**
   * Get queue statistics
   * @returns {object}
   */
  getStats() {
    const uptime = Date.now() - this.startTime;
    const throughput =
      this.totalProcessed > 0 ? this.totalProcessed / (uptime / 1000 / 60) : 0; // per minute

    return {
      queued: this.queue.size,
      processing: this.processing.size,
      completed: this.completed.size,
      failed: this.failed.size,
      totalProcessed: this.totalProcessed,
      maxQueueSize: config.MAX_QUEUE_SIZE,
      uptime: Math.round(uptime / 1000),
      throughputPerMinute: Math.round(throughput * 100) / 100,
    };
  }

  /**
   * Get all jobs with pagination
   * @param {number} limit
   * @param {number} offset
   * @returns {object}
   */
  getAllJobs(limit = 100, offset = 0) {
    const allJobs = [
      ...Array.from(this.queue.values()),
      ...Array.from(this.processing.values()),
      ...Array.from(this.completed.values()),
      ...Array.from(this.failed.values()),
    ];

    // Sort by addedAt desc
    allJobs.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    const total = allJobs.length;
    const jobs = allJobs.slice(offset, offset + limit);

    return {
      jobs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Initialize cleanup scheduler
   */
  initializeCleanup() {
    // Clean old completed/failed jobs every 5 minutes
    setInterval(() => {
      this.cleanupOldJobs();
    }, config.AUTO_CLEANUP_INTERVAL);
  }

  /**
   * Clean up old completed and failed jobs
   */
  cleanupOldJobs() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleaned = 0;

    // Clean completed jobs
    for (const [jobId, job] of this.completed.entries()) {
      if (job.completedAt < oneHourAgo) {
        this.completed.delete(jobId);
        cleaned++;
      }
    }

    // Clean failed jobs
    for (const [jobId, job] of this.failed.entries()) {
      if (job.failedAt < oneHourAgo) {
        this.failed.delete(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} old job records`);
    }
  }
}

module.exports = JobManager;
