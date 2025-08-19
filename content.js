// ArcShot 内容脚本
// 此脚本运行在网页上下文中，用于处理页面交互和UI覆盖
console.log('ArcShot content script loaded');

// 用于区域选择功能的变量
let selectionOverlay = null;
let selectionBox = null;
let instructionText = null;
let isSelecting = false;
let startX = 0, startY = 0;
let currentSelection = null;

// 创建选择区域的覆盖层
function createSelectionOverlay() {
  if (selectionOverlay) return;
  
  selectionOverlay = document.createElement('div');
  selectionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    cursor: crosshair;
    pointer-events: all;
  `;
  
  // 创建指示文字
  instructionText = document.createElement('div');
  instructionText.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 1000000;
    pointer-events: none;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  `;
  instructionText.textContent = '拖拽鼠标选择截图区域，按ESC取消';
  
  // 创建选择框
  selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px dashed #fff;
    background: rgba(255, 255, 255, 0.1);
    display: none;
    pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
  `;
  
  selectionOverlay.appendChild(instructionText);
  selectionOverlay.appendChild(selectionBox);
  document.body.appendChild(selectionOverlay);
  
  // 添加事件监听器
  selectionOverlay.addEventListener('mousedown', startSelection);
  selectionOverlay.addEventListener('mousemove', updateSelection);
  selectionOverlay.addEventListener('mouseup', endSelection);
  
  // 添加键盘事件监听（ESC取消）
  document.addEventListener('keydown', handleKeyPress);
  
  console.log('Selection overlay created');
}

// 移除选择覆盖层
function removeSelectionOverlay() {
  if (selectionOverlay) {
    document.removeEventListener('keydown', handleKeyPress);
    selectionOverlay.remove();
    selectionOverlay = null;
    selectionBox = null;
    instructionText = null;
    isSelecting = false;
    currentSelection = null;
    console.log('Selection overlay removed');
  }
}

// 开始选择
function startSelection(e) {
  if (e.target !== selectionOverlay) return;
  
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
  
  // 更新指示文字
  if (instructionText) {
    instructionText.textContent = '拖拽到目标区域，松开鼠标完成选择';
  }
  
  console.log('Selection started at:', startX, startY);
}

// 更新选择框
function updateSelection(e) {
  if (!isSelecting) return;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
  
  // 更新指示文字显示当前选择区域大小
  if (instructionText && width > 0 && height > 0) {
    instructionText.textContent = `选择区域: ${width} × ${height} 像素，松开鼠标完成`;
  }
}

// 结束选择
function endSelection(e) {
  if (!isSelecting) return;
  
  isSelecting = false;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  console.log('Selection ended:', { left, top, width, height });
  
  // 降低最小选择区域要求
  if (width < 5 || height < 5) {
    console.log('Selection too small, ignored');
    if (instructionText) {
      instructionText.textContent = '选择区域太小，请重新选择';
      instructionText.style.background = 'rgba(220, 53, 69, 0.9)';
    }
    selectionBox.style.display = 'none';
    setTimeout(() => {
      if (instructionText) {
        instructionText.textContent = '拖拽鼠标选择截图区域，按ESC取消';
        instructionText.style.background = 'rgba(0, 0, 0, 0.8)';
      }
    }, 2000);
    return;
  }
  
  currentSelection = {
    x: left,
    y: top,
    width: width,
    height: height
  };
  
  console.log('Sending area selection message:', currentSelection);
  
  // 更新指示文字
  if (instructionText) {
    instructionText.textContent = '正在处理选择区域...';
    instructionText.style.background = 'rgba(40, 167, 69, 0.9)';
  }
  
  // 改进的消息发送机制，带重试功能
  sendMessageWithRetry();
}

// 带重试功能的消息发送
function sendMessageWithRetry(retryCount = 0) {
  const maxRetries = 3;
  const message = {
    action: 'areaSelected',
    selection: currentSelection,
    timestamp: Date.now()
  };
  
  console.log(`Attempt ${retryCount + 1}: Sending message to background:`, message);
  
  // 先检查chrome.runtime是否可用
  if (!chrome.runtime || !chrome.runtime.sendMessage) {
    console.error('chrome.runtime.sendMessage is not available');
    showErrorAndCleanup('Chrome运行时不可用');
    return;
  }
  
  try {
    chrome.runtime.sendMessage(message, (response) => {
      console.log('Message response received:', response);
      
      if (chrome.runtime.lastError) {
        console.error('Message send error:', chrome.runtime.lastError);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => {
            sendMessageWithRetry(retryCount + 1);
          }, 1000 * (retryCount + 1)); // 递增延迟
        } else {
          console.error('Max retries reached, falling back to alternative method');
          fallbackToDirectScreenshot();
        }
      } else if (response && response.success) {
        console.log('Message sent successfully');
        // 延迟移除覆盖层，让用户看到反馈
        setTimeout(() => {
          removeSelectionOverlay();
        }, 500);
      } else {
        console.warn('Unexpected response:', response);
        if (retryCount < maxRetries) {
          setTimeout(() => {
            sendMessageWithRetry(retryCount + 1);
          }, 1000);
        } else {
          fallbackToDirectScreenshot();
        }
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    
    if (retryCount < maxRetries) {
      setTimeout(() => {
        sendMessageWithRetry(retryCount + 1);
      }, 1000);
    } else {
      fallbackToDirectScreenshot();
    }
  }
}

// 备用方案：直接在content script中处理
function fallbackToDirectScreenshot() {
  console.log('Falling back to direct screenshot method');
  
  if (instructionText) {
    instructionText.textContent = '切换到备用处理模式...';
    instructionText.style.background = 'rgba(255, 193, 7, 0.9)';
  }
  
  // 使用postMessage向popup通信（如果popup还在）
  try {
    window.postMessage({
      type: 'ARCSHOT_AREA_SELECTED',
      selection: currentSelection,
      fallback: true
    }, '*');
    
    // 同时尝试直接存储到storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        manualSelectionArea: currentSelection,
        manualSelectionTimestamp: Date.now(),
        needsManualProcessing: true
      }, () => {
        console.log('Selection stored in local storage for manual processing');
        
        if (instructionText) {
          instructionText.textContent = '选择已保存，请重新打开扩展处理';
          instructionText.style.background = 'rgba(23, 162, 184, 0.9)';
        }
        
        setTimeout(() => {
          removeSelectionOverlay();
        }, 3000);
      });
    }
  } catch (error) {
    console.error('Fallback method also failed:', error);
    showErrorAndCleanup('所有处理方式都失败了');
  }
}

// 显示错误并清理
function showErrorAndCleanup(errorMessage) {
  if (instructionText) {
    instructionText.textContent = `错误: ${errorMessage}`;
    instructionText.style.background = 'rgba(220, 53, 69, 0.9)';
  }
  
  setTimeout(() => {
    removeSelectionOverlay();
  }, 3000);
}

// 处理键盘事件
function handleKeyPress(e) {
  if (e.key === 'Escape') {
    console.log('Selection cancelled by ESC key');
    removeSelectionOverlay();
    chrome.runtime.sendMessage({ action: 'selectionCancelled' });
  }
}

// 平滑滚动到指定位置
function scrollToPosition(y) {
  console.log(`尝试滚动到位置: ${y}px, 当前位置: ${window.pageYOffset}px`);
  
  // 确保滚动位置在有效范围内
  const maxScroll = Math.max(
    document.body.scrollHeight - window.innerHeight,
    document.documentElement.scrollHeight - window.innerHeight,
    0
  );
  
  const targetY = Math.min(Math.max(y, 0), maxScroll);
  
  if (targetY !== y) {
    console.log(`调整滚动位置从 ${y}px 到 ${targetY}px (最大滚动: ${maxScroll}px)`);
  }
  
  // 使用多种方法确保滚动成功
  try {
    // 方法1: 使用window.scrollTo
    window.scrollTo({
      top: targetY,
      behavior: 'auto'
    });
    
    // 方法2: 直接设置scrollTop作为备用
    if (document.documentElement.scrollTop !== targetY) {
      document.documentElement.scrollTop = targetY;
    }
    
    if (document.body.scrollTop !== targetY) {
      document.body.scrollTop = targetY;
    }
    
    console.log(`滚动完成，实际位置: ${window.pageYOffset}px`);
  } catch (error) {
    console.error('滚动操作失败:', error);
    
    // 备用方法：直接设置scrollTop
    try {
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
      console.log(`使用备用方法滚动到: ${window.pageYOffset}px`);
    } catch (backupError) {
      console.error('备用滚动方法也失败:', backupError);
    }
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  switch (request.action) {
    case 'ping':
      // 响应ping消息，确认content script已加载
      sendResponse({ success: true, loaded: true });
      break;
      
    case 'startAreaSelection':
      createSelectionOverlay();
      sendResponse({ success: true });
      break;
      
    case 'endAreaSelection':
      removeSelectionOverlay();
      sendResponse({ success: true });
      break;
      
    case 'getPageInfo':
      // 返回页面信息，用于滚动截图等功能
      const scrollInfo = {
        scrollHeight: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        ),
        clientHeight: window.innerHeight || document.documentElement.clientHeight,
        scrollTop: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop,
        offsetHeight: document.documentElement.offsetHeight,
        viewportWidth: window.innerWidth || document.documentElement.clientWidth,
        viewportHeight: window.innerHeight || document.documentElement.clientHeight,
        bodyHeight: document.body.scrollHeight,
        documentHeight: document.documentElement.scrollHeight
      };
      
      console.log('页面信息:', scrollInfo);
      sendResponse(scrollInfo);
      break;
      
    case 'scrollTo':
      // 滚动到指定位置
      const requestedY = request.y || 0;
      const beforeScroll = window.pageYOffset;
      
      scrollToPosition(requestedY);
      
      // 等待一小段时间确保滚动完成
      setTimeout(() => {
        const afterScroll = window.pageYOffset;
        const response = {
          success: true,
          requestedY: requestedY,
          beforeScroll: beforeScroll,
          afterScroll: afterScroll,
          scrollDiff: afterScroll - beforeScroll
        };
        console.log('滚动操作完成:', response);
        sendResponse(response);
      }, 100);
      
      return true; // 保持异步响应通道开放
      break;
      
    default:
      sendResponse({ error: 'Unknown action: ' + request.action });
  }
  
  return true; // 保持消息通道开放以支持异步响应
});

// 添加调试功能
window.ArcShotContentDebug = {
  getPageInfo: () => {
    const info = {
      scrollHeight: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      ),
      clientHeight: window.innerHeight || document.documentElement.clientHeight,
      scrollTop: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop,
      viewportWidth: window.innerWidth || document.documentElement.clientWidth,
      viewportHeight: window.innerHeight || document.documentElement.clientHeight
    };
    console.log('Content Script - 页面信息:', info);
    return info;
  },
  
  testScroll: (y) => {
    console.log(`Content Script - 测试滚动到 ${y}px`);
    const before = window.pageYOffset;
    scrollToPosition(y);
    setTimeout(() => {
      const after = window.pageYOffset;
      console.log(`滚动结果: ${before}px -> ${after}px`);
    }, 100);
  },
  
  createTestOverlay: () => {
    createSelectionOverlay();
    console.log('测试覆盖层已创建');
  },
  
  removeTestOverlay: () => {
    removeSelectionOverlay();
    console.log('测试覆盖层已移除');
  }
};

console.log('ArcShot content script debug functions available at window.ArcShotContentDebug');