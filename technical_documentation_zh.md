# ArcShot Chrome扩展 - 技术文档

## 概述

ArcShot是一个Chrome扩展，旨在增强浏览器内的截图功能。它将为用户提供截取全页截图、手动选择截图区域以及滚动截取长网页的功能。捕获的图像可以导出为PNG格式，并且用户可以选择为图像应用圆角。

## 功能

1. **全屏截图**：截取整个可见屏幕。
2. **手动区域选择**：允许用户选择特定区域进行截图。
3. **滚动截图**：通过滚动截取长网页。
4. **导出为PNG**：将捕获的图像保存为PNG格式。
5. **图像圆角**：为导出的图像应用圆角。

## 技术可行性

### 1. 全屏截图

- **API**：使用 `chrome.tabs.captureVisibleTab` 捕获当前标签页的可见区域。
- **限制**：此API仅捕获可见区域。对于全页截图，我们需要结合多次捕获或使用不同的方法。
- **替代方案**：使用 `chrome.runtime.sendMessage` 与内容脚本通信，该脚本可以滚动并捕获多个部分。

### 2. 手动区域选择

- **API**：使用 `chrome.tabs.captureVisibleTab` 捕获可见区域。
- **实现**：在页面上创建自定义UI覆盖层，允许用户选择区域。
- **挑战**：确保覆盖层响应迅速且准确捕获所选区域。

### 3. 滚动截图

- **API**：结合 `chrome.tabs.captureVisibleTab` 与程序化滚动。
- **实现**：
  - 注入内容脚本以处理滚动。
  - 在页面滚动时捕获每个部分。
  - 将捕获的部分拼接成完整图像。
- **挑战**：处理动态内容并确保无缝拼接。

### 4. 导出为PNG

- **API**：使用HTML5 Canvas API操作和导出图像。
- **实现**：
  - 将捕获的图像转换为canvas元素。
  - 使用 `canvas.toDataURL('image/png')` 生成PNG数据URL。
  - 创建下载链接供用户保存图像。

### 5. 图像圆角

- **API**：使用HTML5 Canvas API应用圆角。
- **实现**：
  - 将捕获的图像绘制到canvas上。
  - 使用 `ctx.beginPath()` 和 `ctx.arc()` 创建圆角。
  - 将图像裁剪到圆角矩形路径。
  - 将修改后的canvas导出为PNG。

## 产品交互设计

### 用户使用路径

1. **点击插件图标**：用户点击浏览器工具栏中的ArcShot插件图标。
2. **默认全屏截图**：插件默认执行全屏截图。
3. **手动区域选择**：用户可以选择手动选择截图区域。
4. **滚动截图选项**：用户可以选择是否进行滚动截图以捕获长网页。
5. **截图结果页面**：截图完成后，进入结果页面。
6. **设置圆角数值**：在结果页面，用户可以输入圆角数值。
7. **保存并下载**：用户点击保存按钮，将带有圆角的图像下载为PNG文件。

### 交互流程

1. **插件图标点击**：用户点击插件图标，触发默认全屏截图。
2. **区域选择**：如果用户选择手动区域选择，插件将提供一个覆盖层供用户选择区域。
3. **滚动截图**：如果用户选择滚动截图，插件将自动滚动页面并捕获多个部分，然后拼接成完整图像。
4. **结果页面**：截图完成后，插件将显示结果页面，用户可以在此页面调整圆角数值。
5. **圆角设置**：用户可以通过输入框设置圆角数值，实时预览效果。
6. **保存下载**：用户点击保存按钮，插件将应用圆角并下载PNG图像。

## 实现计划

### 1. 项目结构

```
ArcShot/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── result.html
├── result.js
├── styles.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── utils/
    └── imageUtils.js
```

### 2. 清单文件 (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "ArcShot",
  "version": "1.0",
  "description": "增强Chrome的截图功能。",
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

### 3. 后台脚本 (background.js)

```javascript
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});
```

### 4. 内容脚本 (content.js)

```javascript
// 捕获可见标签页的函数
function captureVisibleTab() {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    // 处理捕获的图像
    console.log('捕获可见标签页:', dataUrl);
  });
}

// 处理手动区域选择的函数
function handleManualSelection() {
  // 创建区域选择的覆盖层
  // 捕获选定区域
}

// 处理滚动截图的函数
function handleScrollingScreenshot() {
  // 滚动并捕获多个部分
  // 拼接图像
}

// 不同捕获模式的事件监听器
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

### 5. 弹出UI (popup.html)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="popup-container">
    <h2>ArcShot</h2>
    <button id="fullScreenBtn">全屏截图</button>
    <button id="manualSelectBtn">手动选择</button>
    <label for="scrollCheckbox">滚动截图</label>
    <input type="checkbox" id="scrollCheckbox">
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

### 6. 弹出脚本 (popup.js)

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const fullScreenBtn = document.getElementById('fullScreenBtn');
  const manualSelectBtn = document.getElementById('manualSelectBtn');
  const scrollCheckbox = document.getElementById('scrollCheckbox');

  fullScreenBtn.addEventListener('click', () => {
    const scroll = scrollCheckbox.checked;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'captureVisible', scroll: scroll });
    });
  });

  manualSelectBtn.addEventListener('click', () => {
    const scroll = scrollCheckbox.checked;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'manualSelection', scroll: scroll });
    });
  });
});
```

### 7. 结果页面 (result.html)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="result-container">
    <h2>截图结果</h2>
    <img id="screenshotPreview" src="" alt="Screenshot Preview">
    <label for="cornerRadius">圆角:</label>
    <input type="number" id="cornerRadius" min="0" max="50" value="0">
    <button id="saveBtn">保存并下载</button>
  </div>
  <script src="result.js"></script>
</body>
</html>
```

### 8. 结果脚本 (result.js)

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const screenshotPreview = document.getElementById('screenshotPreview');
  const cornerRadiusInput = document.getElementById('cornerRadius');
  const saveBtn = document.getElementById('saveBtn');

  // 获取截图数据
  chrome.storage.local.get(['screenshotDataUrl'], (result) => {
    screenshotPreview.src = result.screenshotDataUrl;
  });

  cornerRadiusInput.addEventListener('input', () => {
    const radius = cornerRadiusInput.value;
    // 应用圆角并更新预览
  });

  saveBtn.addEventListener('click', () => {
    const radius = cornerRadiusInput.value;
    // 应用圆角并下载图像
  });
});
```

### 9. 样式 (styles.css)

```css
.popup-container, .result-container {
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

input[type="number"], input[type="checkbox"] {
  width: 100%;
  padding: 5px;
  margin-top: 10px;
}

#screenshotPreview {
  width: 100%;
  height: auto;
  border: 1px solid #ccc;
  margin-top: 10px;
}
```

### 10. 图像工具 (utils/imageUtils.js)

```javascript
// 为图像应用圆角的函数
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

      // 创建圆角矩形路径
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

      // 绘制图像
      ctx.drawImage(img, 0, 0);

      // 导出为PNG
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageDataUrl;
  });
}

// 拼接图像的函数
function stitchImages(images) {
  // 拼接图像的实现
}
```

## 结论

这份技术文档概述了ArcShot Chrome扩展的关键功能和实现计划。通过利用Chrome的API和HTML5 Canvas，我们可以实现所需的功能。下一步是根据此计划实现代码并进行全面测试。
