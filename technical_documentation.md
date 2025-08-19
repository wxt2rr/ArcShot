# ArcShot Chrome Extension - Technical Documentation

## Overview

ArcShot is a Chrome extension designed to enhance the screenshot capabilities within the browser. It will provide users with the ability to capture full-page screenshots, select specific areas for screenshots manually, and scroll to capture long web pages. The captured images can be exported as PNG files, and users will have the option to apply a corner radius to the images.

## Features

1. **Full Screen Capture**: Capture the entire visible screen.
2. **Manual Area Selection**: Allow users to select a specific area for capture.
3. **Scrolling Screenshot**: Capture long web pages by scrolling.
4. **Export as PNG**: Save the captured image in PNG format.
5. **Image Corner Radius**: Apply a corner radius to the exported image.

## Technical Feasibility

### 1. Full Screen Capture

- **API**: Use `chrome.tabs.captureVisibleTab` to capture the visible area of the current tab.
- **Limitation**: This API only captures the visible area. For full-page capture, we need to combine multiple captures or use a different approach.
- **Alternative**: Use `chrome.runtime.sendMessage` to communicate with a content script that can scroll and capture multiple sections.

### 2. Manual Area Selection

- **API**: Use `chrome.tabs.captureVisibleTab` to capture the visible area.
- **Implementation**: Create a custom UI overlay on the page to allow users to select an area.
- **Challenge**: Ensuring the overlay is responsive and accurately captures the selected area.

### 3. Scrolling Screenshot

- **API**: Combine `chrome.tabs.captureVisibleTab` with programmatic scrolling.
- **Implementation**:
  - Inject a content script to handle scrolling.
  - Capture each section as the page scrolls.
  - Stitch the captured sections together to form a complete image.
- **Challenge**: Handling dynamic content and ensuring seamless stitching.

### 4. Export as PNG

- **API**: Use the HTML5 Canvas API to manipulate and export images.
- **Implementation**:
  - Convert captured images to canvas elements.
  - Use `canvas.toDataURL('image/png')` to generate a PNG data URL.
  - Create a download link for the user to save the image.

### 5. Image Corner Radius

- **API**: Use the HTML5 Canvas API to apply corner radius.
- **Implementation**:
  - Draw the captured image onto a canvas.
  - Use `ctx.beginPath()` and `ctx.arc()` to create rounded corners.
  - Clip the image to the rounded rectangle path.
  - Export the modified canvas as a PNG.

## Implementation Plan

### 1. Project Structure

```
ArcShot/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── styles.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── utils/
    └── imageUtils.js
```

### 2. Manifest File (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "ArcShot",
  "version": "1.0",
  "description": "Enhanced screenshot capabilities for Chrome.",
  "permissions": [
    "activeTab",
    "scripting",
    "downloads"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ]
}
```

### 3. Background Script (background.js)

```javascript
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});
```

### 4. Content Script (content.js)

```javascript
// Function to capture visible tab
function captureVisibleTab() {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    // Handle the captured image
    console.log('Captured visible tab:', dataUrl);
  });
}

// Function to handle manual area selection
function handleManualSelection() {
  // Create overlay for area selection
  // Capture selected area
}

// Function to handle scrolling screenshot
function handleScrollingScreenshot() {
  // Scroll and capture multiple sections
  // Stitch images together
}

// Event listeners for different capture modes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureVisible') {
    captureVisibleTab();
  } else if (request.action === 'manualSelection') {
    handleManualSelection();
  } else if (request.action === 'scrollingScreenshot') {
    handleScrollingScreenshot();
  }
});
```

### 5. Popup UI (popup.html)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="popup-container">
    <h2>ArcShot</h2>
    <button id="fullScreenBtn">Full Screen</button>
    <button id="manualSelectBtn">Manual Select</button>
    <button id="scrollingBtn">Scrolling Screenshot</button>
    <label for="cornerRadius">Corner Radius:</label>
    <input type="number" id="cornerRadius" min="0" max="50" value="0">
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

### 6. Popup Script (popup.js)

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const fullScreenBtn = document.getElementById('fullScreenBtn');
  const manualSelectBtn = document.getElementById('manualSelectBtn');
  const scrollingBtn = document.getElementById('scrollingBtn');
  const cornerRadiusInput = document.getElementById('cornerRadius');

  fullScreenBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'captureVisible' });
    });
  });

  manualSelectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'manualSelection' });
    });
  });

  scrollingBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollingScreenshot' });
    });
  });

  cornerRadiusInput.addEventListener('input', () => {
    const radius = cornerRadiusInput.value;
    // Apply corner radius to the image
  });
});
```

### 7. Styles (styles.css)

```css
.popup-container {
  width: 300px;
  padding: 20px;
  font-family: Arial, sans-serif;
}

button {
  width: 100%;
  padding: 10px;
  margin: 5px 0;
  font-size: 16px;
}

input[type="number"] {
  width: 100%;
  padding: 5px;
  margin-top: 10px;
}
```

### 8. Image Utilities (utils/imageUtils.js)

```javascript
// Function to apply corner radius to an image
function applyCornerRadius(imageDataUrl, radius) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const width = img.width;
      const height = img.height;

      canvas.width = width;
      canvas.height = height;

      // Create rounded rectangle path
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(width - radius, 0);
      ctx.quadraticCurveTo(width, 0, width, radius);
      ctx.lineTo(width, height - radius);
      ctx.quadraticCurveTo(width, height, width - radius, height);
      ctx.lineTo(radius, height);
      ctx.quadraticCurveTo(0, height, 0, height - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Export as PNG
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageDataUrl;
  });
}

// Function to stitch images together
function stitchImages(images) {
  // Implementation for stitching images
}
```

## Conclusion

This technical documentation outlines the key features and implementation plan for the ArcShot Chrome extension. By leveraging Chrome's APIs and HTML5 Canvas, we can achieve the desired functionality. The next step is to implement the code based on this plan and test it thoroughly.