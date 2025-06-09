/**
 * Enhanced content script v4.0 with real-time WebSocket updates
 * Updated selectors for better media detection
 */

const CONFIG = {
  SELECTORS: {
    MEDIA: [
      // Видео селекторы
      "video[playsinline]",
      "video.x1lliihq",
      "article video",
      'div[role="presentation"] video',
      'div[role="dialog"] video',
      "video",

      // Улучшенные фото селекторы для постов
      "article img[sizes]",
      "article img[srcset]",
      'div[role="button"] img[src*="scontent"]',
      'article img[src*="cdninstagram.com"]',
      'article img[src*="fbcdn.net"]',
      'article img[src*="scontent"]',
      'img[src*="scontent"]:not([width="16"]):not([width="24"]):not([width="32"])',

      // Оригинальные селекторы
      'div[role="presentation"] img[src*="cdninstagram.com"]',
      'div[role="presentation"] img[src*="fbcdn.net"]',
      'div[role="dialog"] img[src*="cdninstagram.com"]',
      'div[role="dialog"] img[src*="fbcdn.net"]',
      'img[decoding="auto"]',
      'article img:not([alt=""]):not([width="16"]):not([width="24"])',
      'main img:not([width="16"]):not([width="24"]):not([width="32"])',
    ],
  },
  UI: {
    BUTTON_ID: "telegram-send-button",
    QUEUE_PANEL_ID: "telegram-queue-panel",
  },
  PATHS: {
    REELS: ["/reels/", "/reel/"],
    STORIES: ["/stories/"],
    POSTS: ["/p/"],
  },
  NOTIFICATIONS: {
    SUCCESS_DURATION: 4000,
    ERROR_DURATION: 6000,
    INFO_DURATION: 3000,
  },
};

class VideoExtractor {
  findMedia() {
    // Сначала пробуем стандартные селекторы
    for (const selector of CONFIG.SELECTORS.MEDIA) {
      const media = document.querySelector(selector);
      if (media && this.isValidMedia(media)) {
        console.log(`📸 Found media with selector: ${selector}`, media);
        return media;
      }
    }

    // Если не нашли - более агрессивный поиск для постов
    if (window.location.pathname.includes("/p/")) {
      console.log("📸 Trying aggressive search for posts...");
      const postMedia = this.findPostMedia();
      if (postMedia) return postMedia;
    }

    // Fallback к оригинальному методу
    console.log(
      "📸 No media found with standard selectors, trying alternatives..."
    );
    return this.findAlternativeMedia();
  }

  findPostMedia() {
    // Для постов (/p/) ищем по более широким критериям
    const candidates = [
      "article img[sizes]", // Изображения с атрибутом sizes
      "article img[srcset]", // Изображения с srcset
      'div[role="button"] img', // Кликабельные изображения
      'a img[src*="scontent"]', // Ссылки с изображениями
      'img[src*="scontent"]:not([width="16"]):not([width="24"]):not([width="32"])', // Исключаем иконки
    ];

    for (const selector of candidates) {
      const media = document.querySelector(selector);
      if (media && this.isValidMediaForPost(media)) {
        console.log(`📸 Found post media with: ${selector}`, media);
        return media;
      }
    }

    return null;
  }

  findAlternativeMedia() {
    // Поиск по article элементам
    const articles = document.querySelectorAll("article");
    for (const article of articles) {
      const media = article.querySelector(
        'video, img[src*="cdninstagram"], img[src*="fbcdn"], img[src*="scontent"]'
      );
      if (media && this.isValidMedia(media)) {
        console.log("📸 Found media in article:", media);
        return media;
      }
    }

    // Поиск в main контейнере
    const main = document.querySelector("main");
    if (main) {
      const media = main.querySelector(
        'video, img[src*="cdninstagram"], img[src*="fbcdn"], img[src*="scontent"]'
      );
      if (media && this.isValidMedia(media)) {
        console.log("📸 Found media in main:", media);
        return media;
      }
    }

    console.log("📸 No valid media found anywhere on page");
    return null;
  }

  isValidMediaForPost(media) {
    if (!media || !media.src) return false;

    // Для постов менее строгие проверки
    const src = media.src;

    // Исключаем очевидно служебные изображения
    if (
      src.includes("profile") ||
      src.includes("avatar") ||
      src.includes("icon") ||
      media.alt?.toLowerCase().includes("profile") ||
      media.alt?.toLowerCase().includes("avatar")
    ) {
      return false;
    }

    // Проверяем источник
    const isValidSource =
      src.includes("cdninstagram") ||
      src.includes("fbcdn") ||
      src.includes("scontent");

    if (!isValidSource) return false;

    // Проверяем размеры если доступны, но не отклоняем если недоступны
    const computedStyle = window.getComputedStyle(media);
    const displayWidth = parseInt(computedStyle.width) || media.offsetWidth;
    const displayHeight = parseInt(computedStyle.height) || media.offsetHeight;

    // Если есть display размеры, проверяем их
    if (displayWidth > 0 && displayHeight > 0) {
      return displayWidth >= 150 && displayHeight >= 150;
    }

    // Если нет display размеров, проверяем natural размеры
    if (media.naturalWidth > 0 && media.naturalHeight > 0) {
      return media.naturalWidth >= 150 && media.naturalHeight >= 150;
    }

    // Если размеры недоступны, но источник валидный - принимаем
    console.log("📸 Accepting media with unknown dimensions from valid source");
    return true;
  }

  isValidMedia(media) {
    if (!media) return false;

    console.log("📸 Validating media:", {
      tagName: media.tagName,
      src: media.src,
      currentSrc: media.currentSrc,
    });

    // Для видео - очень простая проверка
    if (media.tagName === "VIDEO") {
      const hasSource = !!(media.src || media.currentSrc);
      console.log("📸 Video validation:", { hasSource });
      return hasSource;
    }

    // Для изображений - тоже упрощаем
    if (media.tagName === "IMG") {
      const src = media.src || "";

      // Исключаем только очевидные служебные изображения
      const isProfile =
        src.includes("profile") ||
        src.includes("avatar") ||
        media.alt?.toLowerCase().includes("profile");

      if (isProfile) {
        console.log("📸 Rejecting profile image");
        return false;
      }

      // Проверяем источник
      const validSource =
        src.includes("cdninstagram") ||
        src.includes("fbcdn") ||
        src.includes("scontent");

      console.log("📸 Image validation:", { validSource, src });

      if (!validSource) return false;

      // Очень мягкая проверка размеров
      const width = media.naturalWidth || media.clientWidth || media.width || 0;
      const height =
        media.naturalHeight || media.clientHeight || media.height || 0;

      if (width > 0 && height > 0 && (width < 50 || height < 50)) {
        console.log("📸 Rejecting tiny image:", { width, height });
        return false;
      }

      return true;
    }

    return false;
  }

  async extractMediaData() {
    console.log("📸 Starting media extraction...", {
      pathname: window.location.pathname,
      url: window.location.href,
    });

    let media = this.findMedia();

    // Если не нашли, пробуем более агрессивные методы
    if (!media) {
      console.log("📸 Standard search failed, trying aggressive methods...");

      // Для видео постов
      if (window.location.pathname.includes("/p/")) {
        media = this.findVideoInPost();
      }

      // Общий поиск любого контента
      if (!media) {
        media = this.findAnyMedia();
      }

      // Ждём и пробуем ещё раз
      if (!media) {
        console.log("📸 Still no media, waiting 1 second...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        media = this.findAnyMedia();
      }
    }

    console.log("📸 Final media extraction result:", {
      mediaFound: !!media,
      mediaType: media?.tagName,
      mediaSrc: media?.src || media?.currentSrc,
      pageUrl: window.location.href,
      pathname: window.location.pathname,
    });

    if (!media) {
      this.debugPageContent();
      return null;
    }

    return {
      mediaUrl: media.src || media.currentSrc || window.location.href,
      mediaType: media.tagName.toLowerCase(),
      pageUrl: window.location.href,
      timestamp: new Date().toISOString(),
    };
  }

  findVideoInPost() {
    console.log("📸 Searching for video in post...");

    // Очень широкий поиск видео
    const videoSelectors = [
      "video", // Любое видео
      "article video",
      "main video",
      '[role="main"] video',
      "div video",
      "video[src]",
      "video[currentSrc]",
      "video[playsinline]",
    ];

    for (const selector of videoSelectors) {
      const videos = document.querySelectorAll(selector);
      console.log(
        `📸 Found ${videos.length} videos with selector: ${selector}`
      );

      for (const video of videos) {
        if (video.src || video.currentSrc) {
          console.log("📸 Found video with src:", {
            src: video.src,
            currentSrc: video.currentSrc,
            selector,
          });
          return video;
        }
      }
    }

    return null;
  }

  findAnyMedia() {
    console.log("📸 Aggressive search for any media...");

    // Ищем вообще любые видео на странице
    const allVideos = document.querySelectorAll("video");
    console.log(`📸 Total videos on page: ${allVideos.length}`);

    for (let i = 0; i < allVideos.length; i++) {
      const video = allVideos[i];
      console.log(`📸 Video ${i}:`, {
        src: video.src,
        currentSrc: video.currentSrc,
        hasSource: !!(video.src || video.currentSrc),
        dimensions: `${video.videoWidth}x${video.videoHeight}`,
        clientDimensions: `${video.clientWidth}x${video.clientHeight}`,
      });

      if (video.src || video.currentSrc) {
        return video;
      }
    }

    // Если видео нет, ищем изображения более агрессивно
    const allImages = document.querySelectorAll("img");
    console.log(`📸 Total images on page: ${allImages.length}`);

    for (let i = 0; i < allImages.length; i++) {
      const img = allImages[i];
      const isValidSource =
        img.src &&
        (img.src.includes("cdninstagram") ||
          img.src.includes("fbcdn") ||
          img.src.includes("scontent"));

      if (isValidSource) {
        console.log(`📸 Valid image ${i}:`, {
          src: img.src,
          dimensions: `${img.naturalWidth}x${img.naturalHeight}`,
          clientDimensions: `${img.clientWidth}x${img.clientHeight}`,
          alt: img.alt,
        });

        // Принимаем любое изображение с валидным источником
        const width = img.naturalWidth || img.clientWidth || 0;
        const height = img.naturalHeight || img.clientHeight || 0;

        if (width >= 50 && height >= 50) {
          // Очень низкий порог
          return img;
        }
      }
    }

    return null;
  }

  debugPageContent() {
    console.log("📸 DEBUG: Detailed page content analysis");

    const videos = document.querySelectorAll("video");
    const images = document.querySelectorAll("img");
    const articles = document.querySelectorAll("article");

    console.log("Videos found:", videos.length);
    console.log("Images found:", images.length);
    console.log("Articles found:", articles.length);
    console.log("Current URL:", window.location.href);
    console.log("Pathname:", window.location.pathname);

    // Детальный анализ всех видео
    videos.forEach((video, index) => {
      console.log(`Video ${index}:`, {
        src: video.src,
        currentSrc: video.currentSrc,
        autoplay: video.autoplay,
        muted: video.muted,
        loop: video.loop,
        controls: video.controls,
        dimensions: `${video.videoWidth}x${video.videoHeight}`,
        clientDimensions: `${video.clientWidth}x${video.clientHeight}`,
        className: video.className,
        id: video.id,
        parent: video.parentElement?.tagName,
      });
    });

    // Анализ первых 10 изображений
    Array.from(images)
      .slice(0, 10)
      .forEach((img, index) => {
        console.log(`Image ${index}:`, {
          src: img.src,
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          clientWidth: img.clientWidth,
          clientHeight: img.clientHeight,
          alt: img.alt,
          className: img.className,
          hasValidSource: !!(
            img.src &&
            (img.src.includes("cdninstagram") ||
              img.src.includes("fbcdn") ||
              img.src.includes("scontent"))
          ),
        });
      });
  }

  isVideoPage() {
    const path = window.location.pathname;
    const isValid =
      CONFIG.PATHS.REELS.some((p) => path.includes(p)) ||
      CONFIG.PATHS.STORIES.some((p) => path.includes(p)) ||
      CONFIG.PATHS.POSTS.some((p) => path.includes(p));

    console.log("📸 Page check:", { path, isValid });
    return isValid;
  }
}

class NotificationManager {
  static show(
    message,
    type = "info",
    duration = CONFIG.NOTIFICATIONS.INFO_DURATION
  ) {
    // Remove existing notifications
    document.querySelectorAll(".reels-notification").forEach((n) => n.remove());

    const notification = document.createElement("div");
    notification.className = `reels-notification reels-notification--${type}`;

    // Enhanced notification with icon
    const icon = this.getIcon(type);
    notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">${icon}</span>
                <span>${message}</span>
            </div>
        `;

    const styles = {
      position: "fixed",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: this.getBackgroundColor(type),
      color: "white",
      padding: "12px 20px",
      borderRadius: "8px",
      zIndex: "999999",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: "14px",
      fontWeight: "500",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
      transition: "all 0.3s ease",
      maxWidth: "400px",
      textAlign: "center",
    };

    Object.assign(notification.style, styles);

    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.style.opacity = "1";
      notification.style.transform = "translateX(-50%) translateY(0)";
    });

    // Auto hide
    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(-50%) translateY(-10px)";
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  static getIcon(type) {
    switch (type) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "ℹ️";
    }
  }

  static getBackgroundColor(type) {
    switch (type) {
      case "success":
        return "#4CAF50";
      case "error":
        return "#f44336";
      case "warning":
        return "#FF9800";
      case "info":
        return "#2196F3";
      default:
        return "rgba(0, 0, 0, 0.9)";
    }
  }
}

class QueuePanel {
  constructor() {
    this.panel = null;
    this.jobs = new Map(); // jobId -> jobElement
    this.isVisible = false;
    this.create();
  }

  create() {
    this.remove();

    this.panel = document.createElement("div");
    this.panel.id = CONFIG.UI.QUEUE_PANEL_ID;

    const styles = {
      position: "fixed",
      top: "80px",
      right: "20px",
      width: "350px",
      maxHeight: "500px",
      overflowY: "auto",
      background: "rgba(255, 255, 255, 0.98)",
      border: "1px solid #e1e5e9",
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
      zIndex: "99998",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: "none",
      backdropFilter: "blur(12px)",
      animation: "slideIn 0.3s ease",
    };

    Object.assign(this.panel.style, styles);

    // Header with real-time status indicator
    const header = document.createElement("div");
    header.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 600; color: #333; font-size: 16px;">📤 Queue</span>
                    <div id="real-time-indicator" style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #ccc;
                        animation: pulse 2s infinite;
                    "></div>
                </div>
                <button id="queue-panel-close" style="
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #666;
                    padding: 4px;
                    border-radius: 4px;
                    transition: background 0.2s;
                ">×</button>
            </div>
        `;

    this.panel.appendChild(header);

    // Jobs container
    this.jobsContainer = document.createElement("div");
    this.jobsContainer.style.padding = "12px";
    this.jobsContainer.innerHTML = `
            <div id="empty-queue" style="
                text-align: center;
                padding: 40px 20px;
                color: #666;
                font-size: 14px;
                display: block;
            ">
                <div style="font-size: 32px; margin-bottom: 12px;">📭</div>
                <div>Queue is empty</div>
                <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                    Videos will appear here when added
                </div>
            </div>
        `;
    this.panel.appendChild(this.jobsContainer);

    // Close button handler
    header.querySelector("#queue-panel-close").addEventListener("click", () => {
      this.hide();
    });

    // Add CSS animations
    this.addAnimationStyles();

    document.body.appendChild(this.panel);
  }

  addAnimationStyles() {
    if (!document.getElementById("queue-panel-styles")) {
      const style = document.createElement("style");
      style.id = "queue-panel-styles";
      style.textContent = `
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes pulse {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }

                .queue-job {
                    transition: all 0.3s ease;
                }

                .queue-job:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
            `;
      document.head.appendChild(style);
    }
  }

  show() {
    if (this.panel) {
      this.panel.style.display = "block";
      this.isVisible = true;
      this.updateRealTimeIndicator(true);
    }
  }

  hide() {
    if (this.panel) {
      this.panel.style.display = "none";
      this.isVisible = false;
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  updateRealTimeIndicator(isConnected) {
    const indicator = this.panel?.querySelector("#real-time-indicator");
    if (indicator) {
      indicator.style.background = isConnected ? "#4CAF50" : "#f44336";
      indicator.title = isConnected
        ? "Real-time updates active"
        : "Real-time updates inactive";
    }
  }

  addJob(jobId, jobData) {
    // Hide empty state
    const emptyState = this.jobsContainer.querySelector("#empty-queue");
    if (emptyState) {
      emptyState.style.display = "none";
    }

    const jobElement = document.createElement("div");
    jobElement.className = "queue-job";
    jobElement.style.cssText = `
            margin-bottom: 12px;
            padding: 16px;
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border-radius: 10px;
            border-left: 4px solid #2196F3;
            position: relative;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        `;

    const videoTitle = this.extractTitleFromUrl(jobData.pageUrl);

    jobElement.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; font-family: monospace;">
                        ${jobId.substring(0, 8)}...
                    </div>
                    <div style="font-size: 14px; color: #333; margin-bottom: 6px; font-weight: 500;">
                        ${videoTitle}
                    </div>
                </div>
                <button class="cancel-btn" style="
                    background: none;
                    border: none;
                    color: #999;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#f5f5f5'; this.style.color='#f44336'"
                   onmouseout="this.style.background='none'; this.style.color='#999'">×</button>
            </div>

            <div class="job-status" style="font-size: 12px; color: #2196F3; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <span class="status-icon">⏳</span>
                <span class="status-text">In queue (position: ${
                  jobData.queuePosition || "?"
                })</span>
            </div>

            <div class="job-progress" style="display: none;">
                <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                    <div class="progress-bar" style="
                        background: linear-gradient(90deg, #2196F3, #21CBF3);
                        height: 100%;
                        width: 0%;
                        transition: width 0.5s ease;
                        border-radius: 3px;
                    "></div>
                </div>
                <div class="progress-text" style="font-size: 11px; color: #666;"></div>
            </div>

            ${
              jobData.realTimeUpdates
                ? `
                <div style="font-size: 10px; color: #4CAF50; display: flex; align-items: center; gap: 4px; margin-top: 8px;">
                    <div style="width: 6px; height: 6px; background: #4CAF50; border-radius: 50%; animation: pulse 2s infinite;"></div>
                    Real-time updates
                </div>
            `
                : ""
            }
        `;

    // Cancel button handler
    jobElement.querySelector(".cancel-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.cancelJob(jobId);
    });

    this.jobs.set(jobId, jobElement);
    this.jobsContainer.appendChild(jobElement);

    this.show();
    this.updateJobCount();
  }

  updateJob(jobId, status) {
    const jobElement = this.jobs.get(jobId);
    if (!jobElement) return;

    const statusEl = jobElement.querySelector(".job-status");
    const statusIcon = jobElement.querySelector(".status-icon");
    const statusText = jobElement.querySelector(".status-text");
    const progressEl = jobElement.querySelector(".job-progress");
    const progressBar = jobElement.querySelector(".progress-bar");
    const progressText = jobElement.querySelector(".progress-text");
    const cancelBtn = jobElement.querySelector(".cancel-btn");

    switch (status.status) {
      case "queued":
        statusIcon.textContent = "⏳";
        statusText.textContent = `In queue`;
        statusEl.style.color = "#666";
        jobElement.style.borderLeftColor = "#666";
        progressEl.style.display = "none";
        break;

      case "processing":
        statusIcon.textContent = "🔄";
        statusText.textContent = `Processing`;
        statusEl.style.color = "#2196F3";
        jobElement.style.borderLeftColor = "#2196F3";

        if (status.progress !== undefined) {
          progressEl.style.display = "block";
          progressBar.style.width = `${status.progress}%`;
          progressText.textContent =
            status.progressMessage || `${status.progress}%`;
        }

        cancelBtn.style.display = "none";
        break;

      case "completed":
        statusIcon.textContent = "✅";
        statusText.textContent = `Sent to Telegram`;
        statusEl.style.color = "#4CAF50";
        jobElement.style.borderLeftColor = "#4CAF50";
        progressEl.style.display = "none";
        cancelBtn.style.display = "none";

        // Add success animation
        jobElement.style.background =
          "linear-gradient(135deg, #e8f5e8, #ffffff)";

        // Auto-remove after 5 seconds
        setTimeout(() => {
          this.removeJob(jobId);
        }, 5000);
        break;

      case "failed":
        statusIcon.textContent = "❌";
        statusText.textContent = `Error: ${status.error || "Unknown error"}`;
        statusEl.style.color = "#f44336";
        jobElement.style.borderLeftColor = "#f44336";
        progressEl.style.display = "none";
        cancelBtn.style.display = "none";

        // Add error styling
        jobElement.style.background =
          "linear-gradient(135deg, #ffeaea, #ffffff)";

        // Auto-remove after 10 seconds
        setTimeout(() => {
          this.removeJob(jobId);
        }, 10000);
        break;
    }
  }

  removeJob(jobId) {
    const jobElement = this.jobs.get(jobId);
    if (jobElement) {
      jobElement.style.opacity = "0";
      jobElement.style.transform = "translateX(100%)";
      setTimeout(() => {
        jobElement.remove();
        this.jobs.delete(jobId);
        this.updateJobCount();

        // Show empty state if no jobs
        if (this.jobs.size === 0) {
          const emptyState = this.jobsContainer.querySelector("#empty-queue");
          if (emptyState) {
            emptyState.style.display = "block";
          }
          setTimeout(() => this.hide(), 2000);
        }
      }, 300);
    }
  }

  async cancelJob(jobId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "cancelJob",
        jobId,
      });

      if (response.success) {
        NotificationManager.show("Job cancelled", "info");
        this.removeJob(jobId);
      } else {
        NotificationManager.show("Failed to cancel job", "error");
      }
    } catch (error) {
      NotificationManager.show("Error cancelling job", "error");
    }
  }

  updateJobCount() {
    // This could update a counter somewhere
  }

  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/");
      const reelId =
        pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];
      return `Reel ${reelId.substring(0, 8)}...`;
    } catch {
      return "Instagram Video";
    }
  }

  remove() {
    const existing = document.getElementById(CONFIG.UI.QUEUE_PANEL_ID);
    if (existing) {
      existing.remove();
    }
    this.panel = null;
    this.jobs.clear();
  }
}

class TelegramButton {
  constructor(extractor, queuePanel) {
    this.extractor = extractor;
    this.queuePanel = queuePanel;
    this.button = null;
    this.isProcessing = false;
  }

  create() {
    this.remove();

    this.button = document.createElement("button");
    this.button.id = CONFIG.UI.BUTTON_ID;
    this.button.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">📤</span>
            <span>Send to Telegram</span>
        </div>
    `;

    const styles = {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      background: "linear-gradient(135deg, #2196F3, #1976D2)",
      color: "white",
      border: "none",
      padding: "14px 20px",
      borderRadius: "25px",
      cursor: "pointer",
      fontWeight: "600",
      zIndex: "99999",
      boxShadow: "0 4px 16px rgba(33, 150, 243, 0.4)",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      fontSize: "14px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      minWidth: "160px",
      textAlign: "center",
    };

    Object.assign(this.button.style, styles);

    this.setupEventHandlers();
    document.body.appendChild(this.button);
    return this.button;
  }

  setupEventHandlers() {
    // Hover effects
    this.button.addEventListener("mouseover", () => {
      if (!this.isProcessing) {
        this.button.style.transform = "scale(1.05) translateY(-2px)";
        this.button.style.boxShadow = "0 8px 25px rgba(33, 150, 243, 0.5)";
      }
    });

    this.button.addEventListener("mouseout", () => {
      if (!this.isProcessing) {
        this.button.style.transform = "scale(1) translateY(0)";
        this.button.style.boxShadow = "0 4px 16px rgba(33, 150, 243, 0.4)";
      }
    });

    // Click handlers
    this.button.addEventListener("click", (e) => {
      if (e.shiftKey) {
        this.queuePanel.toggle();
      } else {
        this.handleClick();
      }
    });

    // Long press for queue panel
    let pressTimer;
    this.button.addEventListener("mousedown", () => {
      pressTimer = setTimeout(() => {
        this.queuePanel.toggle();
      }, 500);
    });

    this.button.addEventListener("mouseup", () => {
      clearTimeout(pressTimer);
    });

    this.button.addEventListener("mouseleave", () => {
      clearTimeout(pressTimer);
    });
  }

  async handleClick() {
    if (this.isProcessing) return;

    try {
      console.log("🔄 Starting click handler...");

      const mediaData = await this.extractor.extractMediaData();
      console.log("📸 Media data extracted:", mediaData);

      if (!mediaData) {
        NotificationManager.show("Media not found on this page", "error");
        return;
      }

      this.setProcessingState(true);
      console.log("📤 Sending message to background...");

      const response = await chrome.runtime.sendMessage({
        action: "sendToTelegram",
        data: mediaData,
      });

      console.log("📨 Response from background:", response);

      // Проверить структуру ответа
      if (!response) {
        throw new Error("No response from background script");
      }

      if (response.success) {
        const result = response.result;
        console.log("✅ Success result:", result);

        this.setSuccessState();

        const message = result.realTimeUpdates
          ? `Added to queue (position: ${result.queuePosition}) • Real-time updates`
          : `Added to queue (position: ${result.queuePosition})`;

        NotificationManager.show(
          message,
          "success",
          CONFIG.NOTIFICATIONS.SUCCESS_DURATION
        );

        // Add to queue panel
        this.queuePanel.addJob(result.jobId, {
          ...mediaData,
          queuePosition: result.queuePosition,
          estimatedWaitTime: result.estimatedWaitTime,
          realTimeUpdates: result.realTimeUpdates,
        });

        // Show help tip for first-time users
        if (this.queuePanel.jobs.size === 1) {
          setTimeout(() => {
            NotificationManager.show(
              "💡 Shift+click or long press button to view queue",
              "info",
              CONFIG.NOTIFICATIONS.INFO_DURATION
            );
          }, 2000);
        }
      } else {
        console.log("❌ Background returned error:", response.error);
        this.setErrorState();
        NotificationManager.show(
          response.error || "Failed to add video to queue",
          "error",
          CONFIG.NOTIFICATIONS.ERROR_DURATION
        );
      }
    } catch (error) {
      console.error("❌ Click handler error:", error);
      console.error("Error stack:", error.stack);

      this.setErrorState();

      // Более специфичные сообщения об ошибках
      let errorMessage = "Connection error. Check server status.";

      if (error.message?.includes("Extension context invalidated")) {
        errorMessage = "Extension needs reload. Please refresh the page.";
      } else if (error.message?.includes("No response")) {
        errorMessage = "Background script not responding. Try refreshing.";
      } else if (error.message?.includes("chrome.runtime")) {
        errorMessage = "Extension communication error. Try refreshing.";
      }

      NotificationManager.show(
        errorMessage,
        "error",
        CONFIG.NOTIFICATIONS.ERROR_DURATION
      );
    }

    // Reset button after delay
    setTimeout(() => {
      this.setIdleState();
    }, 2000);
  }

  setProcessingState(processing) {
    this.isProcessing = processing;

    if (processing) {
      this.button.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="
                        width: 16px;
                        height: 16px;
                        border: 2px solid transparent;
                        border-top: 2px solid white;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                    <span>Adding...</span>
                </div>
            `;
      this.button.style.background = "linear-gradient(135deg, #666, #555)";
      this.button.style.cursor = "not-allowed";
      this.button.style.transform = "scale(1)";

      // Add spin animation if not exists
      if (!document.getElementById("spin-animation")) {
        const style = document.createElement("style");
        style.id = "spin-animation";
        style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
        document.head.appendChild(style);
      }
    }
  }

  setSuccessState() {
    this.button.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 16px;">✅</span>
                <span>Added to Queue</span>
            </div>
        `;
    this.button.style.background = "linear-gradient(135deg, #4CAF50, #388E3C)";
    this.button.style.cursor = "default";
  }

  setErrorState() {
    this.button.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 16px;">❌</span>
                <span>Error</span>
            </div>
        `;
    this.button.style.background = "linear-gradient(135deg, #f44336, #d32f2f)";
    this.button.style.cursor = "default";
  }

  setIdleState() {
    this.isProcessing = false;
    this.button.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 16px;">📤</span>
                <span>Send to Telegram</span>
            </div>
        `;
    this.button.style.background = "linear-gradient(135deg, #2196F3, #1976D2)";
    this.button.style.cursor = "pointer";
  }

  remove() {
    const existing = document.getElementById(CONFIG.UI.BUTTON_ID);
    if (existing) {
      existing.remove();
    }
    this.button = null;
  }

  updateQueueCount(count) {
    if (!this.isProcessing && count > 0) {
      this.button.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 16px;">📤</span>
                    <span>Send to Telegram</span>
                    <span style="
                        background: rgba(255,255,255,0.3);
                        border-radius: 10px;
                        padding: 2px 6px;
                        font-size: 11px;
                        margin-left: 4px;
                    ">${count}</span>
                </div>
            `;
    }
  }
}

class InstagramReelsExtension {
  constructor() {
    this.extractor = new VideoExtractor();
    this.queuePanel = new QueuePanel();
    this.button = new TelegramButton(this.extractor, this.queuePanel);
    this.observer = null;
    this.lastUrl = location.href;
    this.isInitialized = false;

    this.setupUrlMonitoring();
    this.setupMessageListener();
    this.init();
  }

  init() {
    if (this.extractor.isVideoPage()) {
      setTimeout(() => {
        this.button.create();
        this.observeChanges();
        this.isInitialized = true;
      }, 1500);
    } else {
      this.cleanup();
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case "jobProgress":
          this.handleJobProgress(request.jobId, request.status);
          break;
        case "jobFinished":
          this.handleJobFinished(
            request.jobId,
            request.reason,
            request.details
          );
          break;
        case "queueStatsUpdate":
          this.handleQueueStatsUpdate(request);
          break;
        case "connectionStatusChanged":
          this.handleConnectionStatusChanged(request);
          break;
      }
      sendResponse({ received: true });
    });
  }

  handleJobProgress(jobId, status) {
    this.queuePanel.updateJob(jobId, status);

    // Update real-time indicator
    this.queuePanel.updateRealTimeIndicator(true);
  }

  handleJobFinished(jobId, reason, details) {
    switch (reason) {
      case "completed":
        NotificationManager.show(
          "✅ Video successfully sent to Telegram!",
          "success",
          CONFIG.NOTIFICATIONS.SUCCESS_DURATION
        );
        this.queuePanel.updateJob(jobId, { status: "completed", ...details });
        break;

      case "failed":
        const error = details.error || "Unknown error";
        NotificationManager.show(
          `❌ Send failed: ${error}`,
          "error",
          CONFIG.NOTIFICATIONS.ERROR_DURATION
        );
        this.queuePanel.updateJob(jobId, { status: "failed", error });
        break;

      case "cancelled":
        NotificationManager.show("🚫 Job cancelled", "info");
        this.queuePanel.removeJob(jobId);
        break;

      case "timeout":
        NotificationManager.show("⏰ Request timeout", "error");
        this.queuePanel.updateJob(jobId, {
          status: "failed",
          error: "Timeout",
        });
        break;
    }

    this.button.updateQueueCount(this.queuePanel.jobs.size);
  }

  handleQueueStatsUpdate(stats) {
    // Update queue panel with latest stats
    this.queuePanel.updateRealTimeIndicator(stats.realTimeUpdates);

    // Could also update button badge with queue count
    if (stats.queued > 0) {
      this.button.updateQueueCount(stats.queued);
    }
  }

  setupUrlMonitoring() {
    // Monitor URL changes for SPA navigation
    this.urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        setTimeout(() => this.init(), 100);
      }
    });

    this.urlObserver.observe(document, { subtree: true, childList: true });

    // Monitor history changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      setTimeout(() => this.init(), 100);
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      setTimeout(() => this.init(), 100);
    };

    window.addEventListener("popstate", () => this.init());
  }

  observeChanges() {
    this.stopObserving();

    this.observer = new MutationObserver(() => {
      if (!this.extractor.isVideoPage()) {
        this.cleanup();
      }
    });

    const targetNode = document.querySelector("main") || document.body;
    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
    });
  }

  cleanup() {
    this.button.remove();
    this.queuePanel.hide();
    this.stopObserving();
    this.isInitialized = false;
  }

  stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// Initialize extension
let extensionInstance = null;

function initializeExtension() {
  if (extensionInstance) {
    extensionInstance.stopObserving();
  }
  extensionInstance = new InstagramReelsExtension();
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}

// Also initialize on window load for safety
window.addEventListener("load", initializeExtension);

// Handle page visibility changes for real-time updates
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && extensionInstance?.isInitialized) {
    // Refresh connection status when page becomes visible
    extensionInstance.queuePanel.updateRealTimeIndicator(true);
  }
});

// Export for debugging
if (typeof window !== "undefined") {
  window.extensionInstance = extensionInstance;
}
