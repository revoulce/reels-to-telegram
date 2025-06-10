/**
 * Instagram-style notifications
 */
class InstagramNotification {
  static init() {
    this.ensureStyles();
  }

  static show(message, type = "success", duration = 3000) {
    // Remove existing notifications
    document
      .querySelectorAll(".ig-telegram-notification")
      .forEach((n) => n.remove());

    const notification = document.createElement("div");
    notification.className = `ig-telegram-notification ig-telegram-notification--${type}`;

    // Instagram-style notification styling
    const styles = {
      position: "fixed",
      top: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      background: type === "success" ? "#262626" : "#ed4956",
      color: "white",
      padding: "12px 16px",
      borderRadius: "8px",
      zIndex: "999999",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: "14px",
      fontWeight: "400",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      maxWidth: "400px",
      animation: "igSlideIn 0.15s ease",
    };

    Object.assign(notification.style, styles);

    const icon = type === "success" ? "✓" : "⚠";
    notification.innerHTML = `
      <span style="font-size: 16px;">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // Auto-hide
    setTimeout(() => {
      notification.style.animation = "igSlideOut 0.15s ease";
      setTimeout(() => notification.remove(), 150);
    }, duration);
  }

  static ensureStyles() {
    if (!document.getElementById("ig-telegram-styles")) {
      const style = document.createElement("style");
      style.id = "ig-telegram-styles";
      style.textContent = `
        @keyframes igSlideIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes igSlideOut {
          from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
          to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = InstagramNotification;
} else if (typeof window !== "undefined") {
  window.InstagramNotification = InstagramNotification;
}
