// Service Worker保活机制
let keepAliveInterval;

// 启动时保持Service Worker活跃
chrome.runtime.onStartup.addListener(() => {
  console.log('ArcShot background script started');
  startKeepAlive();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('ArcShot background script installed');
  startKeepAlive();
});

// 保持Service Worker活跃
function startKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  keepAliveInterval = setInterval(() => {
    console.log('Background script heartbeat:', new Date().toISOString());
    // 执行一个轻量级操作来保持活跃
    chrome.storage.local.get('heartbeat', () => {
      if (chrome.runtime.lastError) {
        console.log('Heartbeat error (normal):', chrome.runtime.lastError.message);
      }
    });
  }, 25000); // 每25秒一次
}

// 立即启动保活
startKeepAlive();

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked, injecting content script');
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('=== Background received message ===');
  console.log('Request:', request);
  console.log('Sender:', sender);
  console.log('Timestamp:', new Date().toISOString());
  
  // 确保消息处理是异步的
  (async () => {
    try {
      if (request.action === 'areaSelected') {
        console.log('Processing area selection...');
        // 处理区域选择完成
        await handleAreaSelection(request.selection, sender.tab.id);
        sendResponse({ success: true, processed: true, timestamp: Date.now() });
      } else if (request.action === 'selectionCancelled') {
        // 处理选择取消
        console.log('Area selection cancelled');
        sendResponse({ success: true, cancelled: true });
      } else {
        console.log('Unknown action:', request.action);
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error in message handler:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // 保持消息通道开放以支持异步响应
});

// 处理区域选择完成
async function handleAreaSelection(selection, tabId) {
  try {
    console.log('=== Processing area selection ===');
    console.log('Selection:', selection);
    console.log('TabId:', tabId);
    
    // 添加延迟确保页面稳定
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 截取当前可见区域
    console.log('Capturing visible tab...');
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Capture error:', chrome.runtime.lastError);
          reject(new Error('截图失败: ' + chrome.runtime.lastError.message));
        } else {
          console.log('Screenshot captured successfully, data URL length:', dataUrl ? dataUrl.length : 'undefined');
          resolve(dataUrl);
        }
      });
    });
    
    if (!dataUrl) {
      throw new Error('截图数据为空');
    }
    
    // 存储截图和选择信息
    console.log('Storing screenshot data...');
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ 
        screenshotDataUrl: dataUrl,
        selectionArea: selection,
        needsCropping: true,
        processingTimestamp: Date.now()
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error:', chrome.runtime.lastError);
          reject(new Error('保存截图失败: ' + chrome.runtime.lastError.message));
        } else {
          console.log('Screenshot data stored successfully');
          resolve();
        }
      });
    });
    
    // 打开结果页面
    console.log('Opening result page...');
    const resultTab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: chrome.runtime.getURL('result.html') }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('Tab creation error:', chrome.runtime.lastError);
          reject(new Error('打开结果页面失败: ' + chrome.runtime.lastError.message));
        } else {
          console.log('Result page opened successfully, tab ID:', tab.id);
          resolve(tab);
        }
      });
    });
    
    console.log('=== Area selection processing completed successfully ===');
    
  } catch (error) {
    console.error('=== Error processing area selection ===');
    console.error('Error details:', error);
    
    // 尝试通知用户错误
    try {
      chrome.storage.local.set({
        processingError: error.message,
        errorTimestamp: Date.now()
      });
    } catch (storageError) {
      console.error('Failed to store error:', storageError);
    }
    
    throw error; // 重新抛出错误以便上层处理
  }
}