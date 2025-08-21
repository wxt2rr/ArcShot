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
    
    // 🔧 修复：增加延迟确保UI完全清理
    console.log('⏰ 等待UI完全清理...');
    await new Promise(resolve => setTimeout(resolve, 300)); // 增加到300ms确保UI清理
    
    let dataUrl;
    let scrollingData = null;
    
    if (isScrollingMode) {
      console.log('🔄 执行滚动截图模式...');
      // 滚动模式：先进行滚动截图获取完整页面
      const scrollingResult = await performScrollingScreenshotInBackground(tabId);
      dataUrl = scrollingResult.dataUrl;
      scrollingData = scrollingResult;
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
        // 🔧 关键修复：captureVisibleTab的第一个参数是windowId，不是tabId
        // 使用null表示当前窗口
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
    
    // 🔧 修复：一次性存储所有必要数据，避免竞态条件
    console.log('Storing screenshot data...');
    
    await new Promise((resolve, reject) => {
      const storageData = {
        screenshotDataUrl: dataUrl, // 始终存储完整的截图数据（普通截图或拼接后的完整页面）
        selectionArea: selection,
        needsCropping: true,
        isScrollingMode: isScrollingMode,
        processingTimestamp: Date.now()
      };
      
      // 🔧 关键修复：滚动模式只存储元数据，避免配额超限
      if (isScrollingMode && scrollingData) {
        console.log('📦 滚动模式：存储元数据，避免大图片数据');
        storageData.needsStitching = true; // 强制为true
        
        // 🚨 关键修复：不存储图片数据，只存储重新生成所需的元数据
        storageData.scrollingMetadata = {
          actualScrollHeight: scrollingData.scrollingMetadata?.actualScrollHeight,
          actualViewportHeight: scrollingData.scrollingMetadata?.actualViewportHeight,
          scrollableContent: scrollingData.scrollingMetadata?.scrollableContent,
          totalSteps: scrollingData.scrollingMetadata?.totalSteps,
          scrollStep: scrollingData.scrollingMetadata?.scrollStep,
          tabId: tabId, // 保存tabId以便重新截图
          needsRegenerate: true // 标记需要重新生成
        };
        
        console.log('📊 存储的元数据:');
        console.log('   - 总步数:', storageData.scrollingMetadata.totalSteps);
        console.log('   - 每步滚动:', storageData.scrollingMetadata.scrollStep);
        console.log('   - 需要重新生成: true');
        console.log('   - 不存储图片数据，避免配额超限');
      }
      
      console.log('💾 存储数据:', {
        dataUrlLength: dataUrl ? dataUrl.length : 0,
        selectionArea: storageData.selectionArea,
        needsCropping: storageData.needsCropping,
        isScrollingMode: storageData.isScrollingMode,
        needsStitching: storageData.needsStitching,
        hasScrollingMetadata: !!storageData.scrollingMetadata
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
    console.error('Error stack:', error.stack);
    
    // 通知用户错误
    console.log('Attempting to create error result tab...');
    
    try {
      // 存储错误信息
      await new Promise((resolve) => {
        chrome.storage.local.set({
          screenshotError: error.message,
          errorTimestamp: Date.now()
        }, resolve);
      });
      
      // 打开错误页面
      chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
    } catch (errorHandlingError) {
      console.error('Failed to handle error:', errorHandlingError);
    }
    
    throw error; // 重新抛出错误以便上层处理
  }
}

// 在background中实现滚动截图逻辑
async function performScrollingScreenshotInBackground(tabId) {
  console.log('📸 === performScrollingScreenshotInBackground 开始执行 ===');
  
  try {
    // 🔧 新增：权限预检查
    console.log('🔒 检查扩展权限状态...');
    const permissions = await new Promise((resolve) => {
      chrome.permissions.contains({
        permissions: ['tabs'],
        origins: ['<all_urls>']
      }, resolve);
    });
    
    if (!permissions) {
      throw new Error('扩展权限不足，请重新授权扩展');
    }
    console.log('✅ 权限检查通过');
    
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
      const fallbackDataUrl = await new Promise((resolve, reject) => {
        // 🔧 修复：使用null表示当前窗口，不是tabId
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error('截图失败: ' + chrome.runtime.lastError.message));
          } else {
            console.log('✅ 普通截图完成');
            resolve(dataUrl);
          }
        });
      });
      
      // 🔧 修复：返回数据对象而不是直接的dataUrl
      return {
        type: 'simple',
        dataUrl: fallbackDataUrl,
        needsStitching: false
      };
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
        
        // 🔧 关键修复：增加截图间延迟避免频率限制
        if (step > 0) {
          console.log(`⏱️ 截图间延迟，避免频率限制...`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // 🔧 修复：增加到3秒间隔
        }
        
        // 截图（带重试机制）
        console.log(`📷 第${step + 1}步开始截图...`);
        const dataUrl = await captureWithRetry(step + 1, 3, tabId);
        
        screenshots.push(dataUrl);
        successfulSteps++;
        
      } catch (stepError) {
        console.error(`❌ 步骤 ${step + 1} 失败:`, stepError);
        
        // 如果是频率限制错误，增加更长延迟后重试
        if (stepError.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
          console.log(`⏱️ 检测到频率限制，等待3秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          try {
            const retryDataUrl = await captureWithRetry(step + 1, 1, tabId);
            screenshots.push(retryDataUrl);
            successfulSteps++;
            continue;
          } catch (retryError) {
            console.error(`❌ 重试仍失败:`, retryError);
          }
        }
        
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

    console.log(`🔧 返回 ${screenshots.length} 张图片数据，由调用方处理存储...`);

    // 🔧 修复：返回完整的拼接数据对象，不在这里存储
    return {
      type: 'scrolling',
      dataUrl: screenshots[0], // 第一张图片作为占位符
      needsStitching: true,
      pendingStitchImages: screenshots,
      pendingStitchOverlap: calculatedOverlap,
      scrollingMetadata: {
        actualScrollHeight,
        actualViewportHeight,
        scrollableContent,
        totalSteps: screenshots.length,
        scrollStep
      }
    };
    
  } catch (error) {
    console.error('❌ 滚动截图过程出错:', error);
    console.error('错误堆栈:', error.stack);
    
    // 尝试回退到普通截图
    console.log('🔄 尝试使用普通截图作为备用方案...');
    try {
      const fallbackDataUrl = await new Promise((resolve, reject) => {
        // 🔧 修复：使用null表示当前窗口进行fallback截图
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error('备用截图失败: ' + chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        });
      });
      
      console.log('✅ 备用截图成功');
      return {
        type: 'fallback',
        dataUrl: fallbackDataUrl,
        needsStitching: false
      };
    } catch (fallbackError) {
      console.error('❌ 备用截图也失败:', fallbackError);
      throw new Error(`滚动截图失败: ${error.message}，备用截图也失败: ${fallbackError.message}`);
    }
  }
}

// 🔧 新增：带重试机制的截图函数
async function captureWithRetry(stepNumber, maxRetries = 3, tabId = null) {
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      console.log(`📷 第${stepNumber}步截图尝试 ${retry + 1}/${maxRetries}...`);
      
      const dataUrl = await new Promise((resolve, reject) => {
        // 🔧 关键修复：captureVisibleTab需要windowId，不是tabId
        // 如果有tabId，先获取对应的windowId；否则使用null（当前窗口）
        if (tabId) {
          // 获取tab的windowId
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
              console.warn('无法获取tab信息，使用当前窗口:', chrome.runtime.lastError);
              // 如果获取失败，使用null（当前窗口）
              chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                  const error = chrome.runtime.lastError.message;
                  console.error(`❌ 截图错误:`, error);
                  reject(new Error(`第${stepNumber}步截图失败: ${error}`));
                } else {
                  console.log(`✅ 第 ${stepNumber} 步截图完成，数据长度: ${dataUrl ? dataUrl.length : 'undefined'}`);
                  resolve(dataUrl);
                }
              });
            } else {
              // 使用tab的windowId进行截图
              chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                  const error = chrome.runtime.lastError.message;
                  console.error(`❌ 截图错误:`, error);
                  reject(new Error(`第${stepNumber}步截图失败: ${error}`));
                } else {
                  console.log(`✅ 第 ${stepNumber} 步截图完成，数据长度: ${dataUrl ? dataUrl.length : 'undefined'}`);
                  resolve(dataUrl);
                }
              });
            }
          });
        } else {
          // 没有tabId，使用当前窗口
          chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
              const error = chrome.runtime.lastError.message;
              console.error(`❌ 截图错误:`, error);
              reject(new Error(`第${stepNumber}步截图失败: ${error}`));
            } else {
              console.log(`✅ 第 ${stepNumber} 步截图完成，数据长度: ${dataUrl ? dataUrl.length : 'undefined'}`);
              resolve(dataUrl);
            }
          });
        }
      });
      
      return dataUrl;
      
    } catch (error) {
      console.error(`❌ 第${stepNumber}步截图尝试${retry + 1}失败:`, error);
      
      if (retry < maxRetries - 1) {
        // 🔧 修复：针对不同错误类型使用不同延迟
        let delay;
        if (error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
          delay = 5000; // 频率限制错误：5秒延迟
        } else if (error.message.includes('not in effect') || error.message.includes('permission')) {
          delay = 2000; // 权限错误：2秒延迟
        } else {
          delay = 1000; // 其他错误：1秒延迟
        }
        console.log(`⏱️ 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// 移除拼接函数，因为Service Worker环境不支持Image和Canvas
// 所有拼接工作将在popup.js或result.js中完成