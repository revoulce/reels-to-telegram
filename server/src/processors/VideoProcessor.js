const { spawn } = require("child_process");
const fs = require("fs").promises;
const path = require("path");
const config = require("../config");
const { cleanText } = require("../utils/validation");

/**
 * Video Processor - unified gallery-dl approach for all content
 * Handles both media files and metadata JSON
 */
class VideoProcessor {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Normalize Instagram URL for gallery-dl compatibility
   * @param {string} url
   * @returns {string}
   */
  normalizeInstagramUrl(url) {
    try {
      // Fix common gallery-dl compatibility issues
      let normalizedUrl = url;

      // Convert /reels/ to /reel/ (gallery-dl only works with singular form)
      normalizedUrl = normalizedUrl.replace("/reels/", "/reel/");

      // Remove any trailing slashes and query parameters that might interfere
      normalizedUrl = normalizedUrl.split("?")[0]; // Remove query params
      normalizedUrl = normalizedUrl.replace(/\/+$/, "/"); // Normalize trailing slashes

      // Ensure it ends with a slash for consistency
      if (!normalizedUrl.endsWith("/")) {
        normalizedUrl += "/";
      }

      return normalizedUrl;
    } catch (error) {
      console.warn("Failed to normalize URL, using original:", error.message);
      return url;
    }
  }

  /**
   * Process any Instagram content from URL using gallery-dl
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffers: Buffer[], metadata: object, isMultiple: boolean}>}
   */
  async processMedia(pageUrl, jobId, progressCallback) {
    let allocatedMemory = 0;

    try {
      // Step 1: Normalize URL for gallery-dl compatibility
      const normalizedUrl = this.normalizeInstagramUrl(pageUrl);
      console.log(`📦 Normalized URL: ${pageUrl} → ${normalizedUrl}`);

      // Step 2: Download with gallery-dl (10% -> 70%)
      progressCallback(10, "Downloading content with gallery-dl...");

      const downloadResult = await this.downloadWithGalleryDl(
        normalizedUrl,
        jobId,
        progressCallback
      );

      allocatedMemory = downloadResult.totalSize;
      this.memoryManager.allocate(jobId, allocatedMemory);

      // Step 2: Extract metadata from JSON (70% -> 80%)
      progressCallback(70, "Processing metadata...");
      const metadata = this.extractMetadataFromJson(downloadResult.jsonData);

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
   * Download content with gallery-dl and extract both files and metadata
   * @param {string} pageUrl
   * @param {string} jobId
   * @param {function} progressCallback
   * @returns {Promise<{buffers: Buffer[], jsonData: object, totalSize: number}>}
   */
  async downloadWithGalleryDl(pageUrl, jobId, progressCallback) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        galleryProcess.kill("SIGKILL");
        reject(new Error("Gallery-dl timeout exceeded"));
      }, config.DOWNLOAD_TIMEOUT);

      const tempDir = "./temp";
      const galleryArgs = [
        "-C",
        "cookies.txt",
        "-D",
        tempDir,
        "-f",
        `${jobId}_{num}.{extension}`,
        "--write-info-json",
        "-q",
        pageUrl,
      ];

      console.log("📦 Starting gallery-dl with args:", galleryArgs);

      const galleryProcess = spawn("gallery-dl", galleryArgs);
      progressCallback(20, "Downloading content...");

      let errorOutput = "";

      galleryProcess.stdout.on("data", (data) => {
        console.log("📦 gallery-dl stdout:", data.toString());
      });

      galleryProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        console.log("📦 gallery-dl stderr:", data.toString());
      });

      galleryProcess.on("close", async (code) => {
        clearTimeout(timeout);
        console.log(`📦 gallery-dl finished with code: ${code}`);

        try {
          if (code !== 0) {
            throw new Error(
              `gallery-dl failed with code ${code}: ${errorOutput}`
            );
          }

          const files = await fs.readdir(tempDir);
          console.log("📦 All files in temp dir:", files);

          // Find all files for this job
          const jobFiles = files.filter((f) => f.startsWith(jobId)).sort();
          console.log("📦 Job files found:", jobFiles);

          if (jobFiles.length === 0) {
            throw new Error("No files downloaded by gallery-dl");
          }

          // Separate media files and JSON files
          const mediaFiles = jobFiles;
          const jsonFiles = files.filter((f) => f.endsWith("info.json"));

          console.log(
            `📦 Found ${mediaFiles.length} media file(s) and ${jsonFiles.length} JSON file(s)`
          );

          if (mediaFiles.length === 0) {
            throw new Error("No media files found");
          }

          // Process media files
          const buffers = [];
          let totalSize = 0;

          for (let i = 0; i < mediaFiles.length; i++) {
            const mediaFile = mediaFiles[i];
            const filePath = path.join(tempDir, mediaFile);

            try {
              const buffer = await fs.readFile(filePath);
              console.log(`📦 Loaded ${mediaFile}: ${buffer.length} bytes`);

              // Validate memory allocation for each file
              this.memoryManager.validateAllocation(buffer.length);

              buffers.push(buffer);
              totalSize += buffer.length;

              // Clean up file immediately
              await fs.unlink(filePath);

              // Update progress
              const progress = 20 + ((i + 1) / mediaFiles.length) * 40;
              progressCallback(
                Math.round(progress),
                `Loaded ${i + 1}/${
                  mediaFiles.length
                } files (${this.formatMemory(totalSize)})`
              );
            } catch (fileError) {
              console.error(`Error processing file ${mediaFile}:`, fileError);
              // Continue with other files
            }
          }

          if (buffers.length === 0) {
            throw new Error("Failed to load any media files");
          }

          // Process JSON metadata
          let jsonData = {};
          if (jsonFiles.length > 0) {
            try {
              const jsonPath = path.join(tempDir, jsonFiles[0]);
              const jsonContent = await fs.readFile(jsonPath, "utf8");
              jsonData = JSON.parse(jsonContent);

              // Clean up JSON file
              await fs.unlink(jsonPath);

              console.log("📦 Metadata extracted from JSON:", {
                title: jsonData.title,
                username: jsonData.username,
                description: jsonData.description?.substring(0, 100),
              });
            } catch (jsonError) {
              console.warn(
                "Failed to process JSON metadata:",
                jsonError.message
              );
              // Continue without metadata
            }
          }

          // Clean up any remaining files for this job
          await this.cleanupRemainingFiles(tempDir, jobId);

          // Final memory validation
          this.memoryManager.validateAllocation(totalSize);

          progressCallback(
            60,
            `Loaded ${buffers.length} file(s) (${this.formatMemory(
              totalSize
            )} total)`
          );

          console.log(
            `📦 Successfully processed ${buffers.length} files, total size: ${totalSize}`
          );

          resolve({
            buffers,
            jsonData,
            totalSize,
          });
        } catch (error) {
          console.error("📦 Error processing gallery-dl output:", error);
          // Try to clean up any files
          await this.cleanupRemainingFiles(tempDir, jobId).catch(() => {});
          reject(new Error(`Failed to process content: ${error.message}`));
        }
      });

      galleryProcess.on("error", (error) => {
        clearTimeout(timeout);
        console.error("📦 gallery-dl process error:", error);
        reject(new Error(`gallery-dl error: ${error.message}`));
      });
    });
  }

  /**
   * Extract metadata from gallery-dl JSON output
   * @param {object} jsonData
   * @returns {object}
   */
  extractMetadataFromJson(jsonData) {
    if (!jsonData || typeof jsonData !== "object") {
      console.warn("No valid JSON metadata available");
      return this.getDefaultMetadata();
    }

    try {
      return {
        title: cleanText(jsonData.title || "Instagram Content"), // Только для title
        author: cleanText(jsonData.fullname || jsonData.username || ""),
        username: cleanText(jsonData.username || ""),
        fullname: cleanText(jsonData.fullname || ""),
        duration: jsonData.duration || 0,
        view_count: jsonData.view_count || jsonData.views || 0,
        like_count: jsonData.likes || jsonData.like_count || 0,
        upload_date:
          jsonData.upload_date || jsonData.date || jsonData.post_date || null,
        thumbnail: jsonData.thumbnail || null,
        description: jsonData.description || "", // Сырое описание без cleanText

        // Additional Instagram-specific fields
        post_id: jsonData.post_id || jsonData.id || null,
        shortcode: jsonData.post_shortcode || jsonData.shortcode || null,
        tags: Array.isArray(jsonData.tags) ? jsonData.tags.slice(0, 5) : [],
      };
    } catch (error) {
      console.warn(`Error extracting metadata from JSON:`, error.message);
      return this.getDefaultMetadata();
    }
  }

  /**
   * Get default metadata when no JSON data available
   * @returns {object}
   */
  getDefaultMetadata() {
    return {
      title: "Instagram Content",
      author: "",
      username: "",
      fullname: "",
      duration: 0,
      view_count: 0,
      like_count: 0,
      upload_date: null,
      thumbnail: null,
      description: "",
      post_id: null,
      shortcode: null,
      tags: [],
    };
  }

  /**
   * Clean up any remaining files for a job
   * @param {string} tempDir
   * @param {string} jobId
   */
  async cleanupRemainingFiles(tempDir, jobId) {
    try {
      const files = await fs.readdir(tempDir);
      const jobFiles = files.filter((f) => f.startsWith(jobId));

      for (const file of jobFiles) {
        try {
          await fs.unlink(path.join(tempDir, file));
          console.log(`🧹 Cleaned up remaining file: ${file}`);
        } catch (error) {
          console.warn(`Failed to clean up file ${file}:`, error.message);
        }
      }
    } catch (error) {
      console.warn("Failed to clean up remaining files:", error.message);
    }
  }

  /**
   * Format memory size
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

  /**
   * Clean up resources for a job
   * @param {string} jobId
   */
  cleanup(jobId) {
    this.memoryManager.free(jobId);

    // Additional cleanup - remove any leftover files
    this.cleanupRemainingFiles("./temp", jobId).catch(() => {
      // Ignore cleanup errors
    });
  }
}

module.exports = VideoProcessor;
