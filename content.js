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
let isScrollingMode = false; // 新增：标记是否为滚动模式

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
  
  // 根据模式选择坐标系
  if (isScrollingMode) {
    // 滚动模式：需要文档坐标（视口坐标 + 滚动偏移）
    startX = e.clientX + window.pageXOffset;
    startY = e.clientY + window.pageYOffset;
    console.log('滚动模式 - 文档坐标选择开始:', startX, startY);
    console.log('当前滚动偏移:', window.pageXOffset, window.pageYOffset);
  } else {
    // 普通模式：使用视口坐标
    startX = e.clientX;
    startY = e.clientY;
    console.log('普通模式 - 视口坐标选择开始:', startX, startY);
  }
  
  // 选择框始终使用视口坐标显示
  selectionBox.style.left = e.clientX + 'px';
  selectionBox.style.top = e.clientY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
  
  // 更新指示文字
  if (instructionText) {
    if (isScrollingMode) {
      instructionText.textContent = '拖拽选择滚动截图区域，松开鼠标完成';
    } else {
      instructionText.textContent = '拖拽到目标区域，松开鼠标完成选择';
    }
  }
}

// 更新选择框
function updateSelection(e) {
  if (!isSelecting) return;
  
  // 获取当前坐标（根据模式选择坐标系）
  let currentX, currentY;
  if (isScrollingMode) {
    // 滚动模式：使用文档坐标
    currentX = e.clientX + window.pageXOffset;
    currentY = e.clientY + window.pageYOffset;
  } else {
    // 普通模式：使用视口坐标
    currentX = e.clientX;
    currentY = e.clientY;
  }
  
  // 计算选择区域（使用对应的坐标系）
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  // 选择框显示始终使用视口坐标
  const displayLeft = Math.min(e.clientX, isScrollingMode ? 
    (startX - window.pageXOffset) : startX);
  const displayTop = Math.min(e.clientY, isScrollingMode ? 
    (startY - window.pageYOffset) : startY);
  const displayWidth = Math.abs(e.clientX - (isScrollingMode ? 
    (startX - window.pageXOffset) : startX));
  const displayHeight = Math.abs(e.clientY - (isScrollingMode ? 
    (startY - window.pageYOffset) : startY));
  
  selectionBox.style.left = displayLeft + 'px';
  selectionBox.style.top = displayTop + 'px';
  selectionBox.style.width = displayWidth + 'px';
  selectionBox.style.height = displayHeight + 'px';
  
  // 更新指示文字显示当前选择区域大小
  if (instructionText && width > 0 && height > 0) {
    const modeText = isScrollingMode ? '文档' : '视口';
    instructionText.textContent = `${modeText}选择区域: ${Math.round(width)} × ${Math.round(height)} 像素，松开鼠标完成`;
  }
}

// 结束选择
function endSelection(e) {
  if (!isSelecting) return;
  
  isSelecting = false;
  
  // 获取当前坐标（根据模式选择坐标系）
  let currentX, currentY;
  if (isScrollingMode) {
    // 滚动模式：使用文档坐标
    currentX = e.clientX + window.pageXOffset;
    currentY = e.clientY + window.pageYOffset;
    console.log('滚动模式 - 文档坐标选择结束:', currentX, currentY);
  } else {
    // 普通模式：使用视口坐标
    currentX = e.clientX;
    currentY = e.clientY;
    console.log('普通模式 - 视口坐标选择结束:', currentX, currentY);
  }
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  console.log('Selection ended:', { left, top, width, height });
  console.log('坐标模式:', isScrollingMode ? '文档坐标' : '视口坐标');
  
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
    height: height,
    // 新增：标记坐标类型以便后续处理
    coordinateType: isScrollingMode ? 'document' : 'viewport',
    scrollOffset: isScrollingMode ? {
      x: window.pageXOffset,
      y: window.pageYOffset
    } : null
  };
  
  console.log('=== 📐 坐标系统详细信息 ===');
  console.log('选择模式:', isScrollingMode ? '滚动模式（文档坐标）' : '普通模式（视口坐标）');
  console.log('当前页面滚动位置:', `x=${window.pageXOffset}, y=${window.pageYOffset}`);
  console.log('页面总尺寸:', `scrollWidth=${document.documentElement.scrollWidth || document.body.scrollWidth}, scrollHeight=${document.documentElement.scrollHeight || document.body.scrollHeight}`);
  console.log('视口尺寸:', `innerWidth=${window.innerWidth}, innerHeight=${window.innerHeight}`);
  console.log('原始选择坐标:', `startX=${startX}, startY=${startY}, endX=${currentX}, endY=${currentY}`);
  console.log('最终选择区域:', currentSelection);
  
  if (isScrollingMode) {
    console.log('🔍 滚动模式验证:');
    console.log('   - 文档坐标转换为视口坐标:');
    console.log(`   - 左上角: (${left}, ${top}) -> (${left - window.pageXOffset}, ${top - window.pageYOffset})`);
    console.log(`   - 右下角: (${left + width}, ${top + height}) -> (${left + width - window.pageXOffset}, ${top + height - window.pageYOffset})`);
  }
  
  console.log('Sending area selection message:', currentSelection);
  
  // 更新指示文字
  if (instructionText) {
    const modeText = isScrollingMode ? '滚动截图' : '普通截图';
    instructionText.textContent = `正在处理${modeText}选择区域...`;
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
    isScrollingMode: isScrollingMode, // 新增：包含滚动模式信息
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
  
  // 获取更准确的最大滚动距离
  const maxScroll = Math.max(
    (document.body.scrollHeight || 0) - (window.innerHeight || 0),
    (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0),
    0
  );
  
  const targetY = Math.min(Math.max(y, 0), maxScroll);
  
  if (targetY !== y) {
    console.log(`调整滚动位置从 ${y}px 到 ${targetY}px (最大滚动: ${maxScroll}px)`);
  }
  
  // 记录滚动前的位置
  const beforeScroll = window.pageYOffset;
  
  // 使用多种方法确保滚动成功
  try {
    // 方法1: 使用window.scrollTo (最常用方法)
    window.scrollTo({
      top: targetY,
      left: 0,
      behavior: 'auto' // 使用auto而不是smooth，确保立即滚动
    });
    
    // 方法2: 直接设置scrollTop作为备用
    if (document.documentElement.scrollTop !== targetY) {
      document.documentElement.scrollTop = targetY;
    }
    
    if (document.body.scrollTop !== targetY) {
      document.body.scrollTop = targetY;
    }
    
    // 方法3: 使用scrollBy作为额外保障
    const actualPosition = window.pageYOffset;
    const diff = targetY - actualPosition;
    if (Math.abs(diff) > 1) { // 如果误差超过1px，使用scrollBy调整
      window.scrollBy(0, diff);
    }
    
    const finalPosition = window.pageYOffset;
    console.log(`滚动执行结果: ${beforeScroll}px -> ${finalPosition}px (目标: ${targetY}px, 误差: ${Math.abs(finalPosition - targetY)}px)`);
    
    // 如果滚动没有生效，尝试强制滚动
    if (Math.abs(finalPosition - targetY) > 5 && targetY <= maxScroll) {
      console.log('首次滚动效果不佳，尝试强制滚动方法');
      
      // 强制滚动方法
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
      
      // 尝试使用window.scroll()
      window.scroll(0, targetY);
      
      const forceResult = window.pageYOffset;
      console.log(`强制滚动结果: ${forceResult}px (误差: ${Math.abs(forceResult - targetY)}px)`);
    }
    
  } catch (error) {
    console.error('滚动操作失败:', error);
    
    // 最后的备用方法：直接设置scrollTop
    try {
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
      console.log(`使用备用方法滚动到: ${window.pageYOffset}px`);
    } catch (backupError) {
      console.error('所有滚动方法都失败:', backupError);
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
      isScrollingMode = false; // 普通区域选择
      createSelectionOverlay();
      sendResponse({ success: true });
      break;
      
    case 'startScrollingAreaSelection':
      isScrollingMode = true; // 滚动区域选择
      createSelectionOverlay();
      // 更新指示文字以反映滚动模式
      if (instructionText) {
        instructionText.textContent = '拖拽选择区域，将进行滚动截图拼接';
      }
      sendResponse({ success: true });
      break;
      
    case 'endAreaSelection':
      removeSelectionOverlay();
      sendResponse({ success: true });
      break;
      
    case 'getPageInfo':
      // 返回页面信息，用于滚动截图等功能
      const scrollInfo = {
        // 多种方式获取页面总高度，取最大值确保准确
        scrollHeight: Math.max(
          document.body.scrollHeight || 0,
          document.documentElement.scrollHeight || 0,
          document.body.offsetHeight || 0,
          document.documentElement.offsetHeight || 0,
          document.body.clientHeight || 0,
          document.documentElement.clientHeight || 0
        ),
        // 视口高度（多种获取方式）
        clientHeight: window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0,
        viewportHeight: window.innerHeight || document.documentElement.clientHeight || 0,
        // 当前滚动位置
        scrollTop: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
        // 各种高度值用于调试和备用计算
        bodyHeight: document.body.scrollHeight || 0,
        documentHeight: document.documentElement.scrollHeight || 0,
        offsetHeight: document.documentElement.offsetHeight || 0,
        bodyOffsetHeight: document.body.offsetHeight || 0,
        // 视口宽度信息
        viewportWidth: window.innerWidth || document.documentElement.clientWidth || 0,
        clientWidth: document.documentElement.clientWidth || document.body.clientWidth || 0,
        // 页面URL和其他有用信息
        url: window.location.href,
        title: document.title,
        // 检查页面是否可滚动
        isScrollable: (document.body.scrollHeight > window.innerHeight) || 
                     (document.documentElement.scrollHeight > window.innerHeight),
        // 最大可滚动距离
        maxScrollTop: Math.max(
          (document.body.scrollHeight || 0) - (window.innerHeight || 0),
          (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0),
          0
        )
      };
      
      console.log('=== Content Script 页面信息详情 ===');
      console.log('页面URL:', scrollInfo.url);
      console.log('页面标题:', scrollInfo.title);
      console.log('计算的滚动高度:', scrollInfo.scrollHeight);
      console.log('视口高度:', scrollInfo.clientHeight, '/', scrollInfo.viewportHeight);
      console.log('body高度:', scrollInfo.bodyHeight);
      console.log('document高度:', scrollInfo.documentHeight);
      console.log('是否可滚动:', scrollInfo.isScrollable);
      console.log('最大可滚动距离:', scrollInfo.maxScrollTop);
      console.log('当前滚动位置:', scrollInfo.scrollTop);
      
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