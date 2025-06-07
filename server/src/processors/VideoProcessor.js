const { spawn } = require("child_process");
const { promisify } = require("util");
const { exec } = require("child_process");
const config = require("../config");
const { cleanText, formatNumber } = require("../utils/validation");
const { formatMemory } = require("../utils/memory");

const execAsync = promisify(exec);

/**
 * Video Processor - handles video download and metadata extraction
 * Smart tool selection: yt-dlp for videos, gallery-dl for photos
 */
class VideoProcessor {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Process media from URL to memory buffer(s)
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffers: Buffer[], metadata: object, isMultiple: boolean}>}
   */
  async processMedia(pageUrl, jobId, progressCallback) {
    let allocatedMemory = 0;

    try {
      // Step 1: Extract metadata (10%)
      progressCallback(10, "Extracting metadata...");
      const metadata = await this.extractMetadata(pageUrl);

      // Step 2: Smart tool selection and download (10% -> 70%)
      progressCallback(20, "Analyzing content type...");
      const downloadResult = await this.downloadMediaToMemory(
        pageUrl,
        jobId,
        progressCallback
      );

      allocatedMemory = downloadResult.totalSize;
      this.memoryManager.allocate(jobId, allocatedMemory);

      return {
        buffers: downloadResult.buffers,
        metadata,
        totalSize: allocatedMemory,
        isMultiple: downloadResult.buffers.length > 1,
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
   * Download media with smart tool selection
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffers: Buffer[], totalSize: number}>}
   */
  async downloadMediaToMemory(pageUrl, jobId, progressCallback) {
    // Сначала определяем тип контента
    const hasVideo = await this.checkForVideo(pageUrl);

    if (hasVideo) {
      console.log("🎥 Video detected, using yt-dlp");
      progressCallback(25, "Video detected, downloading...");
      return this.downloadVideoWithYtDlp(pageUrl, jobId, progressCallback);
    } else {
      console.log("📸 No video detected, using gallery-dl for photos");
      progressCallback(25, "Photos detected, downloading...");
      return this.downloadMultipleWithGalleryDl(
        pageUrl,
        jobId,
        progressCallback
      );
    }
  }

  /**
   * Check if URL contains video content
   * @param {string} pageUrl
   * @returns {Promise<boolean>}
   */
  async checkForVideo(pageUrl) {
    try {
      // Быстрая проверка метаданных без скачивания
      const command = `yt-dlp --cookies cookies.txt --dump-json --no-download --quiet "${pageUrl}"`;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15000, // Короткий таймаут для быстрой проверки
        maxBuffer: 1024 * 1024,
      });

      if (!stdout || !stdout.trim()) {
        console.log("🔍 No metadata from yt-dlp, assuming photos");
        return false;
      }

      const metadata = JSON.parse(stdout.trim());

      // Проверяем наличие видео форматов
      const hasVideoFormats =
        metadata.formats &&
        metadata.formats.some(
          (format) =>
            format.vcodec &&
            format.vcodec !== "none" &&
            format.ext &&
            ["mp4", "webm", "mov"].includes(format.ext.toLowerCase())
        );

      // Также проверяем по типу и продолжительности
      const hasVideoDuration = metadata.duration && metadata.duration > 0;
      const isVideoType = metadata._type !== "image";

      const result = hasVideoFormats || (hasVideoDuration && isVideoType);
      console.log(`🔍 Video check result: ${result}`, {
        hasVideoFormats,
        hasVideoDuration,
        isVideoType,
        duration: metadata.duration,
        formatCount: metadata.formats?.length || 0,
      });

      return result;
    } catch (error) {
      console.log("🔍 Video check failed, assuming photos:", error.message);
      return false; // По умолчанию считаем что это фото
    }
  }

  /**
   * Download video with yt-dlp
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffers: Buffer[], totalSize: number}>}
   */
  async downloadVideoWithYtDlp(pageUrl, jobId, progressCallback) {
    return new Promise((resolve, reject) => {
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
      let totalSize = 0;
      let lastProgressUpdate = 0;

      ytDlpProcess.stderr.on("data", (data) => {
        const errorMsg = data.toString();
        console.error("🎥 yt-dlp error:", errorMsg);

        if (
          errorMsg.includes("No video formats found") ||
          errorMsg.includes("ERROR")
        ) {
          ytDlpProcess.kill();
          reject(new Error("No video content found"));
        }
      });

      ytDlpProcess.stdout.on("data", (chunk) => {
        chunks.push(chunk);
        totalSize += chunk.length;

        // Проверка лимитов памяти
        try {
          this.memoryManager.validateAllocation(totalSize);
        } catch (error) {
          ytDlpProcess.kill("SIGKILL");
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
      });

      ytDlpProcess.on("close", (code) => {
        console.log(`🎥 yt-dlp finished with code: ${code}`);

        if (code === 0 && chunks.length > 0) {
          const combinedBuffer = Buffer.concat(chunks);
          resolve({
            buffers: [combinedBuffer],
            totalSize: combinedBuffer.length,
          });
        } else {
          reject(new Error(`yt-dlp failed with code ${code}`));
        }
      });

      ytDlpProcess.on("error", (error) => {
        console.error("🎥 yt-dlp process error:", error);
        reject(new Error(`yt-dlp error: ${error.message}`));
      });
    });
  }

  /**
   * Download multiple images with gallery-dl
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffers: Buffer[], totalSize: number}>}
   */
  async downloadMultipleWithGalleryDl(pageUrl, jobId, progressCallback) {
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
        `${jobId}_{num}.{extension}`,
        "--verbose",
        pageUrl,
      ];

      console.log("📸 Starting gallery-dl with args:", galleryArgs);

      const galleryProcess = spawn("gallery-dl", galleryArgs);
      progressCallback(30, "Downloading images with gallery-dl...");

      galleryProcess.stdout.on("data", (data) => {
        console.log("📸 gallery-dl stdout:", data.toString());
      });

      galleryProcess.stderr.on("data", (data) => {
        console.log("📸 gallery-dl stderr:", data.toString());
      });

      galleryProcess.on("close", async (code) => {
        clearTimeout(timeout);
        console.log(`📸 gallery-dl finished with code: ${code}`);

        try {
          const fs = require("fs").promises;
          const path = require("path");

          const files = await fs.readdir(tempDir);
          console.log("📸 All files in temp dir:", files);

          const imageFiles = files.filter((f) => f.startsWith(jobId)).sort(); // Сортируем для правильного порядка

          console.log("📸 Matching image files:", imageFiles);

          if (imageFiles.length === 0) {
            throw new Error("No downloaded files found");
          }

          console.log(`📸 Found ${imageFiles.length} image(s) for processing`);

          const buffers = [];
          let totalSize = 0;

          // Обрабатываем все найденные файлы
          for (let i = 0; i < imageFiles.length; i++) {
            const imageFile = imageFiles[i];
            const filePath = path.join(tempDir, imageFile);
            const buffer = await fs.readFile(filePath);

            console.log(`📸 Loaded ${imageFile}: ${buffer.length} bytes`);

            // Проверяем лимиты для каждого файла
            this.memoryManager.validateAllocation(buffer.length);

            buffers.push(buffer);
            totalSize += buffer.length;

            // Удаляем временный файл
            await fs.unlink(filePath);

            // Обновляем прогресс
            const progress = 30 + ((i + 1) / imageFiles.length) * 30;
            progressCallback(
              Math.round(progress),
              `Loaded ${i + 1}/${imageFiles.length} images (${this.formatMemory(
                totalSize
              )})`
            );
          }

          // Финальная проверка общего размера
          this.memoryManager.validateAllocation(totalSize);

          progressCallback(
            60,
            `Loaded ${buffers.length} image(s) (${this.formatMemory(
              totalSize
            )} total)`
          );

          console.log(
            `📸 Successfully processed ${buffers.length} images, total size: ${totalSize}`
          );
          resolve({ buffers, totalSize });
        } catch (error) {
          console.error("📸 Error processing files:", error);
          reject(new Error(`Failed to process files: ${error.message}`));
        }
      });

      galleryProcess.on("error", (error) => {
        clearTimeout(timeout);
        console.error("📸 gallery-dl process error:", error);
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
   * Clean up resources for a job
   * @param {string} jobId
   */
  cleanup(jobId) {
    this.memoryManager.free(jobId);
  }
}

module.exports = VideoProcessor;
