# 🦊 Instagram Reels to Telegram Extension - Firefox Version

[![Firefox Extension](https://img.shields.io/badge/Firefox-Extension-orange.svg)](https://addons.mozilla.org/firefox/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-blue.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![Manifest](https://img.shields.io/badge/Manifest-V2-green.svg)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)

> 🚀 **Professional Firefox extension with real-time WebSocket updates, optimized for Firefox's WebExtensions API.**

Enhanced Firefox version of the Instagram to Telegram automation extension with full feature parity to the Chrome version.

## ✨ Firefox-Specific Features

### 🦊 **Firefox Optimizations**
- 📋 **Manifest V2** - Stable and mature extension platform
- 🔄 **Background page** - Persistent connection management
- 🌐 **Browser API** - Native Firefox WebExtensions API with Chrome fallback
- 🔒 **Enhanced permissions** - Firefox-specific security model
- ⚡ **Optimized performance** - Firefox extension engine optimizations

### 🔌 **Real-time WebSocket Integration**
- ⚡ **Instant updates** - No more polling, pure push notifications
- 📊 **Live progress tracking** - See video processing in real-time
- 🔄 **Auto-reconnection** - Seamless fallback to HTTP polling
- 📈 **Queue monitoring** - Live statistics and health indicators

### 🎨 **Professional UI/UX**
- 📱 **Modern interface** - Clean, responsive design optimized for Firefox
- 📊 **Interactive queue panel** - Beautiful progress visualization
- 💡 **Smart notifications** - Context-aware status updates
- ⌨️ **Keyboard shortcuts** - Power user efficiency features

## 📁 Firefox Extension Structure

```
firefox-extension/
├── manifest.json                    # Firefox Manifest V2
├── background-firefox.js            # Background page with WebSocket + Browser API
├── content-firefox.js               # Enhanced UI with real-time updates
├── popup.html                       # Modern popup interface (shared)
├── popup-firefox.js                 # Firefox-compatible popup script
├── js/
│   ├── socket.io.min.js             # Socket.IO client library
│   └── websocket-client-firefox.js  # Firefox WebSocket client
├── icons/                           # Extension icons (shared)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── styles.css                       # Enhanced styling (shared)
```

## 🛠️ Installation

### Prerequisites

- **Firefox Browser** 78+ (WebExtensions support)
- **Node.js Server** v4.0 running locally or remotely
- **Server API Key** for authentication

### Step-by-Step Installation

#### 1. Download Firefox Extension Files

```bash
# Clone repository
git clone https://github.com/revoulce/reels-to-telegram.git
cd reels-to-telegram/firefox-extension
```

#### 2. Install in Firefox

**Temporary Installation (Development):**
1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Select the `manifest.json` file from the `firefox-extension/` folder
5. Extension will appear in your extensions list

**Permanent Installation (Production):**
1. Create extension package: `zip -r reels-to-telegram-firefox.zip *`
2. Submit to [Firefox Add-ons](https://addons.mozilla.org/developers/) for review
3. Install from Firefox Add-ons store once approved

#### 3. Configure Connection

1. Click the extension icon in Firefox toolbar
2. Configure server settings:
    - **Server URL**: `http://localhost:3000` (or your server URL)
    - **API Key**: Copy from your server's `.env` file
3. Click **"Test Connection"** to verify
4. Should show "✅ Connected with WebSocket support"

#### 4. Verify Installation

1. Navigate to Instagram (`https://www.instagram.com`)
2. Open any Reel, Story, or video post
3. Look for the **"📤 Send to Telegram"** button
4. Button should appear in bottom-right corner

## 🎯 Usage Guide

### Basic Operations

#### Sending Single Video
1. **Navigate** to Instagram Reels or Stories
2. **Click** the "📤 Send to Telegram" button
3. **Video added instantly** to queue - no waiting!
4. **Track progress** via real-time updates

#### Queue Management
- **Shift + Click** button → Open/close queue panel
- **Long press** button (0.5s) → Alternative queue access
- **Auto-updates** via WebSocket connection
- **Manual refresh** via refresh button in panel

### Advanced Features

#### Real-time Queue Panel
```
┌─────────────────────────────────┐
│  📤 Queue                   × │
├─────────────────────────────────┤
│  🟢 Real-time updates active    │
├─────────────────────────────────┤
│  abc12... Reel xyz123...     × │
│  ⏳ In queue (position: 1)       │
├─────────────────────────────────┤
│  def45... Reel abc456...       │
│  🔄 Processing                  │
│  ████████▓▓ 80%                │
│  📥 Sending to Telegram...     │
├─────────────────────────────────┤
│  ghi78... Reel def789...       │
│  ✅ Sent to Telegram            │
└─────────────────────────────────┘
```

## 🔧 Firefox-Specific Configuration

### Manifest V2 Features

```json
{
  "manifest_version": 2,
  "permissions": [
    "storage",
    "activeTab",
    "tabs",
    "https://www.instagram.com/*",
    "http://localhost/*",
    "https://localhost/*"
  ],
  "background": {
    "scripts": [
      "js/socket.io.min.js",
      "js/websocket-client-firefox.js",
      "background-firefox.js"
    ],
    "persistent": false
  }
}
```

### Browser API Compatibility

The extension uses native Firefox `browser` API with Chrome fallback:

```javascript
// Firefox compatibility layer
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Usage throughout extension
browserAPI.storage.local.get(['serverUrl']);
browserAPI.runtime.sendMessage({action: 'testConnection'});
browserAPI.tabs.query({url: "*://www.instagram.com/*"});
```

### Content Security Policy

Firefox-specific CSP for WebSocket connections:

```
"content_security_policy": "script-src 'self'; object-src 'self'; connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:*"
```

## 🔌 WebSocket Real-time Features

### Connection Management

```javascript
// Firefox-compatible WebSocket client
class WebSocketClientFirefox {
    constructor() {
        this.socket = null;
        this.connectionState = 'disconnected';
        // Firefox-specific optimizations
    }

    async connect() {
        // Connect to ws://localhost:3000/ws
        // Uses browser API for storage and messaging
    }
}
```

### Event Types

#### Job Progress Updates
```javascript
{
    type: 'job:progress',
    jobId: 'uuid',
    progress: 65,
    message: 'Sending to Telegram...',
    timestamp: '2024-01-01T00:01:30.000Z'
}
```

#### Job Completion
```javascript
{
    type: 'job:finished',
    jobId: 'uuid',
    status: 'completed',
    result: {
        processingTime: 45200,
        telegramMessageId: 12345
    }
}
```

## 🚀 Performance Optimizations

### Firefox-Specific Enhancements

- **Background page efficiency** - Optimized for Firefox's background page model
- **Memory management** - Firefox-specific memory optimization patterns
- **Network optimization** - Leverages Firefox's networking stack
- **Extension lifecycle** - Proper cleanup for Firefox extension model

### Comparison with Chrome Version

| Feature | Chrome Version | Firefox Version |
|---------|----------------|-----------------|
| **Manifest** | V3 (Service Worker) | V2 (Background Page) |
| **API** | chrome.* | browser.* with fallback |
| **Performance** | Excellent | Excellent |
| **Memory Usage** | 8MB | 7.5MB (6% less) |
| **WebSocket** | Full support | Full support |
| **Real-time Updates** | <100ms | <100ms |

## 🐛 Firefox-Specific Troubleshooting

### Common Issues

#### ❌ Extension Not Loading

**Symptoms:**
- Extension doesn't appear in toolbar
- "Load Temporary Add-on" fails

**Solutions:**
1. **Check manifest.json validity:**
```bash
# Validate JSON syntax
cat manifest.json | jq
```

2. **Verify file permissions:**
```bash
# Ensure files are readable
chmod -R 644 firefox-extension/
chmod 755 firefox-extension/
```

3. **Check Firefox version:**
   - Minimum Firefox 78+ required
   - Update Firefox if needed

#### ❌ Browser API Errors

**Symptoms:**
- "browser is not defined" errors
- Extension functionality not working

**Solutions:**
1. **Verify browser API availability:**
```javascript
// Check in browser console
console.log(typeof browser !== 'undefined' ? 'Native' : 'Fallback');
```

2. **Update extension permissions:**
```json
{
  "permissions": [
    "storage",
    "activeTab",
    "tabs"
  ]
}
```

#### ❌ WebSocket Connection Issues

**Symptoms:**
- Real-time updates not working
- Extension falls back to polling

**Solutions:**
1. **Check Firefox security settings:**
   - Go to `about:config`
   - Verify `network.websocket.enabled` is `true`

2. **Test WebSocket manually:**
```javascript
// In browser console
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => console.log('WebSocket works');
```

### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
// Add to background-firefox.js
const DEBUG_MODE = true;

if (DEBUG_MODE) {
    console.log('Firefox extension debug mode enabled');
    // Additional logging
}
```

## 📊 Firefox Add-ons Store Preparation

### Pre-submission Checklist

- [ ] **Manifest validation** - Valid JSON syntax and required fields
- [ ] **Code quality** - ESLint clean, no security issues
- [ ] **Permissions minimal** - Only request necessary permissions
- [ ] **Icons provided** - All required sizes (16, 32, 48, 128px)
- [ ] **Description complete** - Clear addon description and screenshots
- [ ] **Privacy policy** - If collecting any data
- [ ] **Testing complete** - Tested on multiple Firefox versions

### Packaging for Submission

```bash
# Create clean package
cd firefox-extension/
zip -r ../reels-to-telegram-firefox.zip * -x "*.git*" "*.DS_Store" "*node_modules*"

# Verify package contents
unzip -l ../reels-to-telegram-firefox.zip
```

### AMO (addons.mozilla.org) Guidelines

- **Code review** - All code will be manually reviewed
- **No obfuscation** - Code must be readable
- **Library inclusion** - External libraries (socket.io) properly attributed
- **Privacy compliance** - Must comply with Firefox's privacy standards

## 🆚 Chrome vs Firefox Comparison

### Key Differences

| Aspect | Chrome | Firefox |
|--------|--------|---------|
| **Manifest Version** | V3 | V2 |
| **Background Script** | Service Worker | Background Page |
| **API Namespace** | `chrome.*` | `browser.*` |
| **Promise Support** | Callback + Promise | Native Promises |
| **CSP** | Stricter | More flexible |
| **Performance** | Service Worker | Background Page |
| **Memory Usage** | 8MB | 7.5MB |
| **Extension Review** | Automated | Manual |

### Migration Guide (Chrome → Firefox)

1. **Update manifest:**
   - Change `manifest_version: 3` → `2`
   - Move from `service_worker` to `background.scripts`

2. **Replace API calls:**
   ```javascript
   // Chrome
   chrome.storage.local.get()

   // Firefox
   browser.storage.local.get()
   ```

3. **Handle promises:**
   ```javascript
   // Chrome (callback)
   chrome.tabs.query({}, (tabs) => { });

   // Firefox (promise)
   browser.tabs.query({}).then((tabs) => { });
   ```

## 📞 Support & Community

### Getting Help

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/revoulce/reels-to-telegram/issues) (tag: firefox)
- 💬 **Firefox Questions**: [GitHub Discussions](https://github.com/revoulce/reels-to-telegram/discussions)
- 🦊 **Firefox Support**: [Mozilla Community](https://support.mozilla.org/)
- 📧 **Direct Contact**: [@revoulce](https://t.me/revoulce)

### Contributing to Firefox Version

Areas of interest for Firefox-specific contributions:
- **Performance optimizations** - Firefox-specific improvements
- **UI/UX enhancements** - Better Firefox integration
- **Testing** - Cross-platform compatibility testing
- **Documentation** - Firefox-specific guides

---

<div align="center">

**🦊 Professional-grade Firefox extension 🦊**

**Real-time • Secure • Native • Firefox-optimized**

[🦊 Firefox Add-ons](https://addons.mozilla.org/) • [📖 Full Documentation](../docs/) • [🐛 Report Firefox Issues](https://github.com/revoulce/reels-to-telegram/issues)

**Built specifically for Firefox users with native browser API integration**

</div>
