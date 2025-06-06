const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const config = require('../config');
const { cleanText, formatNumber } = require('../utils/validation');
const { formatMemory } = require('../utils/memory');

const execAsync = promisify(exec);

/**
 * Video Processor - handles video download and metadata extraction
 */
class VideoProcessor {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Process media from URL to memory buffer
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffer: Buffer, metadata: object}>}
   */
  async processMedia(pageUrl, jobId, progressCallback) {
    let allocatedMemory = 0;

    try {
      // Step 1: Extract metadata (10%)
      progressCallback(10, "Extracting video metadata...");
      const metadata = await this.extractMetadata(pageUrl);

      // Step 2: Download video to memory (10% -> 70%)
      progressCallback(30, "Downloading video to memory...");
      const downloadResult = await this.downloadMediaToMemory(
        pageUrl,
        jobId,
        progressCallback
      );

      allocatedMemory = downloadResult.size;
      this.memoryManager.allocate(jobId, allocatedMemory);

      return {
        buffer: downloadResult.buffer,
        metadata,
        size: allocatedMemory,
      };
    } catch (error) {
      // Free memory on error
      if (allocatedMemory > 0) {
        this.memoryManager.free(jobId);
      }
      throw error;
    }
  }

  /**
   * Download video directly to memory using yt-dlp streaming
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffer: Buffer, size: number}>}
   */
  async downloadMediaToMemory(pageUrl, jobId, progressCallback) {
    return new Promise((resolve, reject) => {
      // Сначала пробуем yt-dlp для видео
      const ytDlpArgs = [
        "--cookies",
        "cookies.txt",
        "--format",
        "best[ext=mp4]/best",
        "--output",
        "-",
        "--no-playlist",
        "--max-filesize",
        config.MAX_FILE_SIZE.toString(),
        "--quiet",
        pageUrl,
      ];

      const ytDlpProcess = spawn("yt-dlp", ytDlpArgs);
      let chunks = [];
      let hasError = false;
      let totalSize = 0;
      let lastProgressUpdate = 0;

      ytDlpProcess.stderr.on("data", (data) => {
        const errorMsg = data.toString();
        if (errorMsg.includes("No video formats found")) {
          hasError = true;
          ytDlpProcess.kill();

          // Переключаемся на gallery-dl для фото
          this.downloadWithGalleryDl(pageUrl, jobId, progressCallback)
            .then(resolve)
            .catch(reject);
        }
      });

      ytDlpProcess.stdout.on("data", (chunk) => {
        if (!hasError) {
          chunks.push(chunk);
          totalSize += chunk.length;

          // Проверка лимитов памяти
          try {
            this.memoryManager.validateAllocation(totalSize);
          } catch (error) {
            galleryProcess.kill("SIGKILL");
            reject(error);
            return;
          }

          // Обновление прогресса (throttled)
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) {
            const progress = Math.min(
              30 + (totalSize / config.MAX_FILE_SIZE) * 40,
              70
            );
            progressCallback(
              Math.round(progress),
              `Downloaded ${this.formatMemory(totalSize)}...`
            );
            lastProgressUpdate = now;
          }
        }
      });

      ytDlpProcess.on("close", (code) => {
        if (!hasError && code === 0 && chunks.length > 0) {
          resolve({
            buffer: Buffer.concat(chunks),
            size: chunks.reduce((a, b) => a + b.length, 0),
          });
        } else if (!hasError) {
          reject(new Error(`yt-dlp failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Download image with gallery-dl
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffer: Buffer, size: number}>}
   */
  async downloadWithGalleryDl(pageUrl, jobId, progressCallback) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        galleryProcess.kill("SIGKILL");
        reject(new Error("Gallery-dl timeout exceeded"));
      }, config.DOWNLOAD_TIMEOUT);

      const tempDir = "./temp";
      const galleryArgs = [
        "--cookies",
        "cookies.txt",
        "-D",
        tempDir,
        "-f",
        `${jobId}_{filename}.{extension}`,
        pageUrl,
      ];

      const galleryProcess = spawn("gallery-dl", galleryArgs);
      progressCallback(30, "Downloading image with gallery-dl...");

      galleryProcess.on("close", async (code) => {
        clearTimeout(timeout);

        // if (code === 0) {
        try {
          const fs = require("fs").promises;
          const path = require("path");

          const files = await fs.readdir(tempDir);
          const imageFile = files.find((f) => f.startsWith(jobId));

          if (!imageFile) {
            throw new Error("Downloaded file not found");
          }

          const filePath = path.join(tempDir, imageFile);
          const buffer = await fs.readFile(filePath);

          this.memoryManager.validateAllocation(buffer.length);
          await fs.unlink(filePath);

          progressCallback(
            60,
            `Loaded ${this.formatMemory(buffer.length)} to memory`
          );
          resolve({ buffer, size: buffer.length });
        } catch (error) {
          reject(new Error(`Failed to process file: ${error.message}`));
        }
        // } else {
        //   reject(new Error(`gallery-dl failed with code ${code}`));
        // }
      });

      galleryProcess.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`gallery-dl error: ${error.message}`));
      });
    });
  }

  formatMemory(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Extract video metadata using yt-dlp
   * @param {string} pageUrl
   * @returns {Promise<object>}
   */
  async extractMetadata(pageUrl) {
    try {
      const command = `yt-dlp --cookies cookies.txt --dump-json --no-download --quiet "${pageUrl}"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 10,
      });

      // Проверка на пустой ответ
      if (!stdout || !stdout.trim()) {
        console.warn(`⚠️ Empty metadata response for ${pageUrl}`);
        return this.getDefaultMetadata();
      }

      // Проверка на ошибки в stderr
      if (stderr && stderr.includes("No video formats found")) {
        console.warn(`⚠️ No video formats found for ${pageUrl}`);
        return this.getDefaultMetadata();
      }

      const metadata = JSON.parse(stdout.trim());

      return {
        title: cleanText(metadata.title || metadata.description || ""),
        author: cleanText(metadata.uploader || metadata.channel || ""),
        duration: metadata.duration || 0,
        view_count: metadata.view_count || 0,
        like_count: metadata.like_count || 0,
        upload_date: metadata.upload_date || null,
        thumbnail: metadata.thumbnail || null,
      };
    } catch (error) {
      console.warn(`⚠️ Metadata extraction failed: ${error.message}`);
      return this.getDefaultMetadata();
    }
  }

  /**
   * Get default metadata
   * @returns {object}
   */
  getDefaultMetadata() {
    return {
      title: "Instagram Post",
      author: "",
      duration: 0,
      view_count: 0,
      like_count: 0,
      upload_date: null,
      thumbnail: null,
    };
  }

  /**
   * Create Telegram caption from metadata
   * @param {object} metadata
   * @param {string} pageUrl
   * @returns {string}
   */
  createCaption(metadata, pageUrl) {
    let caption = "";

    if (metadata.title) {
      caption += `🎬 ${metadata.title}\n\n`;
    }

    if (metadata.author) {
      caption += `👤 ${metadata.author}\n`;
    }

    if (metadata.view_count > 0) {
      caption += `👁 ${formatNumber(metadata.view_count)} просмотров\n`;
    }

    if (metadata.like_count > 0) {
      caption += `❤️ ${formatNumber(metadata.like_count)} лайков\n`;
    }

    if (metadata.duration > 0) {
      const minutes = Math.floor(metadata.duration / 60);
      const seconds = metadata.duration % 60;
      caption += `⏱ ${minutes}:${seconds.toString().padStart(2, "0")}\n`;
    }

    caption += `\n🔗 ${pageUrl}`;

    return caption.substring(0, 1024); // Telegram limit
  }

  /**
   * Clean up resources for a job
   * @param {string} jobId
   */
  cleanup(jobId) {
    this.memoryManager.free(jobId);
  }
}

module.exports = VideoProcessor;
