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
        console.log('Scrolling mode:', request.isScrollingMode);
        // 处理区域选择完成
        await handleAreaSelection(request.selection, sender.tab.id, request.isScrollingMode);
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
async function handleAreaSelection(selection, tabId, isScrollingMode = false) {
  try {
    console.log('=== Processing area selection ===');
    console.log('Selection:', selection);
    console.log('TabId:', tabId);
    console.log('Scrolling mode:', isScrollingMode);
    
    // 添加延迟确保页面稳定
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let dataUrl;
    
    if (isScrollingMode) {
      console.log('🔄 执行滚动截图模式...');
      // 滚动模式：先进行滚动截图获取完整页面
      dataUrl = await performScrollingScreenshotInBackground(tabId);
      console.log('✅ 滚动截图完成，准备裁剪选择区域');
      
      // 检查是否成功获取到拼接图片
      if (!dataUrl) {
        throw new Error('滚动截图拼接失败，无法获取完整页面图片');
      }
    } else {
      console.log('📷 执行普通截图模式...');
      // 普通模式：截取当前可见区域
      console.log('Capturing visible tab...');
      dataUrl = await new Promise((resolve, reject) => {
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
    }
    
    if (!dataUrl) {
      throw new Error('截图数据为空');
    }
    
    // 存储截图和选择信息 - 统一的存储逻辑
    console.log('Storing screenshot data...');
    
    await new Promise((resolve, reject) => {
      const storageData = {
        screenshotDataUrl: dataUrl, // 始终存储完整的截图数据（普通截图或拼接后的完整页面）
        selectionArea: selection,
        needsCropping: true,
        isScrollingMode: isScrollingMode,
        processingTimestamp: Date.now()
      };
      
      console.log('💾 存储数据:', {
        dataUrlLength: dataUrl ? dataUrl.length : 0,
        selectionArea: storageData.selectionArea,
        needsCropping: storageData.needsCropping,
        isScrollingMode: storageData.isScrollingMode
      });
      
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error:', chrome.runtime.lastError);
          reject(new Error('保存截图失败: ' + chrome.runtime.lastError.message));
        } else {
          console.log('✅ 截图数据存储成功');
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

// 在background中实现滚动截图逻辑
async function performScrollingScreenshotInBackground(tabId) {
  console.log('📸 === performScrollingScreenshotInBackground 开始执行 ===');
  console.log('目标标签页ID:', tabId);
  
  try {
    console.log('📊 正在获取页面信息...');
    // 获取页面信息
    const pageInfo = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, (response) => {
        console.log('📨 Content script响应:', response);
        if (chrome.runtime.lastError) {
          console.error('❌ Content script通信失败:', chrome.runtime.lastError);
          reject(new Error('获取页面信息失败: ' + chrome.runtime.lastError.message));
        } else {
          console.log('✅ 页面信息获取成功');
          resolve(response);
        }
      });
    });

    const { scrollHeight, clientHeight, viewportHeight, bodyHeight, documentHeight, isScrollable, maxScrollTop } = pageInfo;
    
    // 改进的滚动需求判断逻辑
    const actualScrollHeight = Math.max(scrollHeight, bodyHeight, documentHeight);
    const actualViewportHeight = Math.max(clientHeight, viewportHeight);
    const scrollableContent = actualScrollHeight - actualViewportHeight;
    
    console.log('=== 🔍 详细的滚动截图分析 ===');
    console.log('📏 实际页面高度:', actualScrollHeight);
    console.log('📏 实际视口高度:', actualViewportHeight);
    console.log('📏 可滚动内容高度:', scrollableContent);
    console.log('📏 页面是否可滚动:', isScrollable);
    console.log('📏 最大滚动距离:', maxScrollTop);
    
    // 更宽松的滚动判断条件：如果可滚动内容超过50px就进行滚动截图
    if (scrollableContent <= 50) {
      console.log('⚠️ 页面内容高度不足，使用普通截图');
      console.log(`❌ 可滚动内容仅 ${scrollableContent}px，小于阈值50px`);
      return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error('截图失败: ' + chrome.runtime.lastError.message));
          } else {
            console.log('✅ 普通截图完成');
            resolve(dataUrl);
          }
        });
      });
    }

    console.log('🎉 页面需要滚动截图！');
    console.log(`📏 页面需要滚动截图: 总高度=${actualScrollHeight}px, 可见高度=${actualViewportHeight}px, 可滚动=${scrollableContent}px`);

    const screenshots = [];
    // 与popup.js保持完全一致的重叠计算
    const scrollStep = Math.floor(actualViewportHeight * 0.85); // 15% overlap，与popup.js一致
    const calculatedOverlap = Math.floor(actualViewportHeight * 0.15); // 15% overlap，与popup.js一致
    const totalSteps = Math.ceil(scrollableContent / scrollStep) + 1;
    
    console.log(`📋 滚动截图计划:`);
    console.log(`   - 总步数: ${totalSteps}`);
    console.log(`   - 每步滚动: ${scrollStep}px`);
    console.log(`   - 重叠区域: ${calculatedOverlap}px`);
    console.log(`   - 重叠比例: 15% (与popup.js一致)`);
    console.log(`   - 步长比例: 85% (与popup.js一致)`);

    console.log('🔄 重置滚动位置到顶部...');
    // 重置滚动位置到顶部
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: 0 }, (response) => {
        console.log('📍 重置滚动响应:', response);
        setTimeout(resolve, 500); // 增加等待时间确保滚动完成
      });
    });

    let successfulSteps = 0;
    console.log('🎬 开始逐步滚动截图...');
    
    // 逐步滚动并截图
    for (let step = 0; step < totalSteps; step++) {
      const scrollY = step * scrollStep;
      
      console.log(`📸 执行第 ${step + 1}/${totalSteps} 步，滚动到: ${scrollY}px`);
      
      try {
        // 滚动到指定位置
        const scrollResult = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: scrollY }, (response) => {
            console.log(`📍 第${step + 1}步滚动响应:`, response);
            resolve(response);
          });
        });
        
        // 检查滚动是否成功
        if (!scrollResult || !scrollResult.success) {
          console.warn(`⚠️ 步骤 ${step + 1} 滚动可能失败:`, scrollResult);
          // 如果滚动失败但已有截图，继续处理；如果是第一步就失败，则报错
          if (step === 0) {
            throw new Error('无法滚动页面，请检查页面是否支持滚动');
          }
        }
        
        // 增加等待时间确保页面渲染完成
        console.log(`⏱️ 等待页面渲染完成...`);
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // 截图
        console.log(`📷 第${step + 1}步开始截图...`);
        const dataUrl = await new Promise((resolve, reject) => {
          chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
              reject(new Error(`第${step + 1}步截图失败: ` + chrome.runtime.lastError.message));
            } else {
              console.log(`✅ 第 ${step + 1} 步截图完成，数据长度: ${dataUrl ? dataUrl.length : 'undefined'}`);
              resolve(dataUrl);
            }
          });
        });
        
        screenshots.push(dataUrl);
        successfulSteps++;
        
      } catch (stepError) {
        console.error(`❌ 步骤 ${step + 1} 失败:`, stepError);
        
        // 如果是前几步失败，直接抛出错误
        if (step < 2) {
          throw new Error(`滚动截图在第 ${step + 1} 步失败: ${stepError.message}`);
        }
        
        // 如果已经有一些成功的截图，继续但记录错误
        console.warn(`⚠️ 跳过步骤 ${step + 1}，继续下一步`);
      }
    }

    // 检查是否有足够的截图
    if (screenshots.length === 0) {
      throw new Error('没有成功截取任何图片');
    }
    
    console.log(`📊 截图统计:`);
    console.log(`   - 成功截图: ${screenshots.length}/${totalSteps}`);
    console.log(`   - 成功率: ${(screenshots.length/totalSteps*100).toFixed(1)}%`);
    
    if (screenshots.length < totalSteps * 0.5) {
      console.warn(`⚠️ 只成功截取了 ${screenshots.length}/${totalSteps} 张图片，成功率较低`);
    } else {
      console.log(`✅ 截图成功率良好: ${screenshots.length}/${totalSteps} (${(screenshots.length/totalSteps*100).toFixed(1)}%)`);
    }

    console.log(`🔧 存储 ${screenshots.length} 张图片数据，由有DOM环境的脚本处理拼接...`);

    // 存储拼接数据，让有DOM环境的脚本处理
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({
        pendingStitchImages: screenshots,
        pendingStitchOverlap: calculatedOverlap,
        needsStitching: true,
        scrollingMetadata: {
          actualScrollHeight,
          actualViewportHeight,
          scrollableContent,
          totalSteps: screenshots.length,
          scrollStep
        }
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error('存储拼接数据失败'));
        } else {
          console.log('✅ 拼接数据已存储，将由有DOM的环境处理');
          resolve();
        }
      });
    });
    
    console.log('✅ 滚动截图数据收集完成，返回第一张图片作为占位符');
    // 返回第一张图片作为占位符，真正的拼接将在有DOM的环境中完成
    return screenshots[0];
    
  } catch (error) {
    console.error('❌ 滚动截图过程出错:', error);
    console.error('错误堆栈:', error.stack);
    
    // 尝试回退到普通截图
    console.log('🔄 尝试使用普通截图作为备用方案...');
    try {
      const fallbackDataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error('备用截图失败: ' + chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        });
      });
      
      console.log('✅ 备用截图成功');
      return fallbackDataUrl;
    } catch (fallbackError) {
      console.error('❌ 备用截图也失败:', fallbackError);
      throw new Error(`滚动截图失败: ${error.message}，备用截图也失败: ${fallbackError.message}`);
    }
  }
}

// 移除拼接函数，因为Service Worker环境不支持Image和Canvas
// 所有拼接工作将在popup.js或result.js中完成