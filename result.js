document.addEventListener('DOMContentLoaded', () => {
  const screenshotPreview = document.getElementById('screenshotPreview');
  const cornerRadius = document.getElementById('cornerRadius');
  const saveBtn = document.getElementById('saveBtn');

  let originalDataUrl = null;
  let needsCropping = false;
  let selectionArea = null;
  let loadAttempt = 0;

  function showMessage(message, type = 'info') {
    // 移除已存在的消息
    const existingMessage = document.querySelector('.dynamic-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // 创建新的消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type} dynamic-message`;
    messageDiv.textContent = message;
    
    // 插入到editing-panel的开头
    const editingPanel = document.querySelector('.editing-panel');
    if (editingPanel) {
      editingPanel.insertBefore(messageDiv, editingPanel.firstChild);
    } else {
      // 如果找不到editing-panel，插入到container开头
      const container = document.querySelector('.result-container');
      if (container) {
        container.insertBefore(messageDiv, container.firstChild);
      }
    }
    
    // 自动移除成功和信息类消息
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 3000);
    }
    
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  // 🔧 新增：图像裁剪函数
  function cropImageFromCanvas(imageDataUrl, selection) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // 设置画布尺寸为选择区域的尺寸
          canvas.width = selection.width;
          canvas.height = selection.height;
          
          console.log('🎨 裁剪参数:');
          console.log('  - 原图尺寸:', img.width, 'x', img.height);
          console.log('  - 选择区域:', selection);
          console.log('  - 画布尺寸:', canvas.width, 'x', canvas.height);
          
          // 🔧 修复：Chrome扩展的captureVisibleTab已经返回实际像素大小
          // 不需要再乘以devicePixelRatio，直接使用selection坐标
          const devicePixelRatio = window.devicePixelRatio || 1;
          console.log('  - 设备像素比:', devicePixelRatio, '(仅用于调试，不影响计算)');
          
          // 直接使用selection的坐标，Chrome扩展截图已经是正确的像素比
          let adjustedX = selection.x;
          let adjustedY = selection.y;
          let adjustedWidth = selection.width;
          let adjustedHeight = selection.height;
          
          console.log('  - 使用原始坐标（Chrome扩展已处理像素比）:', { adjustedX, adjustedY, adjustedWidth, adjustedHeight });
          
          // 确保裁剪区域不超出图像边界
          const finalX = Math.max(0, Math.min(adjustedX, img.width - adjustedWidth));
          const finalY = Math.max(0, Math.min(adjustedY, img.height - adjustedHeight));
          const finalWidth = Math.min(adjustedWidth, img.width - finalX);
          const finalHeight = Math.min(adjustedHeight, img.height - finalY);
          
          console.log('  - 边界检查后最终坐标:', { finalX, finalY, finalWidth, finalHeight });
          
          // 绘制裁剪后的图像部分
          ctx.drawImage(
            img,
            finalX, finalY, finalWidth, finalHeight,  // 源坐标和尺寸
            0, 0, selection.width, selection.height    // 目标坐标和尺寸
          );
          
          const croppedDataUrl = canvas.toDataURL('image/png');
          console.log('✅ 图像裁剪完成，裁剪后数据长度:', croppedDataUrl.length);
          resolve(croppedDataUrl);
        } catch (error) {
          console.error('❌ 裁剪过程中出错:', error);
          reject(error);
        }
      };
      img.onerror = () => {
        reject(new Error('Failed to load image for cropping'));
      };
      img.src = imageDataUrl;
    });
  }

  // 🔧 修复：重试机制处理时序问题
  async function loadScreenshotData(attempt = 1) {
    loadAttempt = attempt;
    
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (allData) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        // 🔧 修复：根据时间戳和数据完整性判断最新数据源
        let dataSource = 'none';
        let shouldStitch = false;
        let mainImageData = null;
        let stitchData = null;
        let captureTime = 0;
        
        // 候选数据源（按时间戳排序）
        const candidates = [];
        
        // 检查手动滚动截图数据（新版本）
        if (allData.manual_stitch_images && allData.manual_stitch_images.length > 1) {
          candidates.push({
            source: 'manual_scrolling',
            shouldStitch: true,
            mainImageData: allData.manual_screenshot_data,
            stitchData: allData.manual_stitch_images,
            time: allData.manual_selection_timestamp || 0,
            overlap: allData.manual_stitch_overlap || 0
          });
        }
        
        // 🔧 新增：检查新格式的手动+滚动截图数据
        if (allData.needsStitching && allData.pendingStitchImages && allData.pendingStitchImages.length > 1 && allData.captureType === 'manual-scrolling') {
          candidates.push({
            source: 'manual_scrolling_new',
            shouldStitch: true,
            mainImageData: allData.screenshotDataUrl,
            stitchData: allData.pendingStitchImages,
            time: allData.processingTimestamp || 0,
            overlap: allData.pendingStitchOverlap || 0
          });
        }
        
        // 检查手动普通截图（新版本）
        if (allData.manual_screenshot_data) {
          candidates.push({
            source: 'manual_simple',
            shouldStitch: false,
            mainImageData: allData.manual_screenshot_data,
            stitchData: null,
            time: allData.manual_selection_timestamp || 0
          });
        }
        
        // 检查全屏截图数据（包含时间戳）- 排除滚动截图
        if (allData.screenshotDataUrl && !allData.needsStitching && allData.captureType !== 'manual-scrolling') {
          candidates.push({
            source: allData.isFullscreen ? 'fullscreen' : 'legacy_simple',
            shouldStitch: false,
            mainImageData: allData.screenshotDataUrl,
            stitchData: null,
            time: allData.captureTime || allData.timestamp || 0,
            captureType: allData.captureType || 'unknown'
          });
        }
        
        // 检查滚动截图数据（旧版本）
        if (allData.needsStitching && allData.pendingStitchImages && allData.pendingStitchImages.length > 1) {
          candidates.push({
            source: 'legacy_scrolling',
            shouldStitch: true,
            mainImageData: allData.screenshotDataUrl,
            stitchData: allData.pendingStitchImages,
            time: allData.processingTimestamp || 0,
            overlap: allData.pendingStitchOverlap || 0
          });
        }
        
        // 🔧 新增：检查需要重新生成的滚动截图数据
        if (allData.needsStitching && allData.scrollingMetadata && allData.scrollingMetadata.needsRegenerate) {
          candidates.push({
            source: 'scrolling_regenerate',
            shouldStitch: true,
            shouldRegenerate: true,
            mainImageData: allData.screenshotDataUrl,
            scrollingMetadata: allData.scrollingMetadata,
            time: allData.processingTimestamp || 0
          });
        }
        
        // 🔧 关键修复：优先选择需要拼接的数据源，然后按时间戳选择
        if (candidates.length > 0) {
          // 优先选择需要拼接的数据源
          const stitchingCandidates = candidates.filter(c => c.shouldStitch);
          const nonStitchingCandidates = candidates.filter(c => !c.shouldStitch);
          
          let latest;
          if (stitchingCandidates.length > 0) {
            // 如果有需要拼接的候选项，优先选择最新的
            latest = stitchingCandidates.reduce((prev, current) => {
              return (current.time > prev.time) ? current : prev;
            });
            console.log(`🎯 优先选择拼接数据源: ${latest.source}`);
          } else {
            // 否则选择最新的非拼接数据源
            latest = nonStitchingCandidates.reduce((prev, current) => {
              return (current.time > prev.time) ? current : prev;
            });
            console.log(`🎯 选择非拼接数据源: ${latest.source}`);
          }
          
          dataSource = latest.source;
          shouldStitch = latest.shouldStitch;
          mainImageData = latest.mainImageData;
          stitchData = latest.stitchData;
          captureTime = latest.time;
          
          console.log(`📊 数据源: ${dataSource} (时间: ${new Date(captureTime).toLocaleString()})`);
          console.log(`📊 需要拼接: ${shouldStitch}`);
          console.log(`📊 候选数据源:`, candidates.map(c => `${c.source}(拼接:${c.shouldStitch},时间:${new Date(c.time).toLocaleString()})`));
        } else {
          console.warn('⚠️ 没有找到任何有效的截图数据');
          showMessage('没有找到截图数据，请重新截图', 'error');
        }
        
        resolve({
          success: true,
          dataSource,
          shouldStitch,
          mainImageData,
          stitchData,
          allData,
          scrollingMetadata: allData.scrollingMetadata // 🔧 添加scrollingMetadata字段
        });
      });
    });
  }

  // 🔧 新增：手动+滚动截图的宽度裁剪功能
  async function cropWidthAfterStitching(stitchedImageDataUrl, selection) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // 设置画布尺寸为选择区域的宽度，高度保持不变
          canvas.width = selection.width;
          canvas.height = img.height;
          
          // 从拼接后的长图中按选择区域的x和width进行裁剪
          ctx.drawImage(
            img,
            selection.x, // 源图像的x坐标
            0,           // 源图像的y坐标（拼接后已经处理了高度）
            selection.width, // 源图像的宽度
            img.height,  // 源图像的高度（完整高度）
            0,           // 目标画布的x坐标
            0,           // 目标画布的y坐标
            selection.width, // 目标画布的宽度
            img.height   // 目标画布的高度
          );
          
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => {
        reject(new Error('无法加载拼接后的图像进行宽度裁剪'));
      };
      img.src = stitchedImageDataUrl;
    });
  }

  // 🔧 图像拼接功能
  function stitchImages(imageDataUrls, overlap = 0) {
    return new Promise((resolve, reject) => {
      if (!imageDataUrls || imageDataUrls.length === 0) {
        reject(new Error('No images provided'));
        return;
      }
      
      if (imageDataUrls.length === 1) {
        resolve(imageDataUrls[0]);
        return;
      }

      const images = [];
      let loadedCount = 0;

      // Load all images first
      imageDataUrls.forEach((dataUrl, index) => {
        const img = new Image();
        img.onload = () => {
          images[index] = img;
          loadedCount++;
          
          if (loadedCount === imageDataUrls.length) {
            // All images loaded, now stitch them
            stitchLoadedImages();
          }
        };
        img.onerror = () => {
          reject(new Error(`Failed to load image ${index}`));
        };
        img.src = dataUrl;
      });

      function stitchLoadedImages() {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Calculate total height
          const width = images[0].width;
          let totalHeight = images[0].height;
          
          for (let i = 1; i < images.length; i++) {
            totalHeight += (images[i].height - overlap);
          }
          
          canvas.width = width;
          canvas.height = totalHeight;
          
          // Draw first image
          ctx.drawImage(images[0], 0, 0);
          
          // Draw subsequent images with overlap
          let currentY = images[0].height;
          for (let i = 1; i < images.length; i++) {
            currentY -= overlap;
            ctx.drawImage(images[i], 0, currentY);
            currentY += images[i].height;
          }
          
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      }
    });
  }

  // 🔧 新增：重新生成滚动截图函数
  async function regenerateScrollingScreenshot(metadata) {
    console.log('🔄 开始重新生成滚动截图...');
    console.log('📊 使用元数据:', metadata);
    
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
      
      // 🔧 关键修复：验证元数据完整性
      if (!metadata) {
        throw new Error('滚动截图元数据缺失');
      }
      
      const { totalSteps, scrollStep, actualViewportHeight, tabId: metadataTabId } = metadata;
      
      // 验证关键参数
      if (!totalSteps || totalSteps <= 0) {
        throw new Error(`无效的滚动步数: ${totalSteps}`);
      }
      if (!scrollStep || scrollStep <= 0) {
        throw new Error(`无效的滚动距离: ${scrollStep}`);
      }
      if (!actualViewportHeight || actualViewportHeight <= 0) {
        throw new Error(`无效的视口高度: ${actualViewportHeight}`);
      }
      
      console.log(`✅ 元数据验证通过 - 步数:${totalSteps}, 滚动:${scrollStep}px, 视口:${actualViewportHeight}px`);
      
      // 🔧 关键修复：正确获取原始页面的tabId
      // 因为result.html是新打开的标签页，不能查询当前活动标签页
      let tabId = metadataTabId;
      
      if (!tabId) {
        // 如果没有存储的tabId，尝试查询除当前页面外的其他标签页
        console.warn('没有存储的原始tabId，尝试查找非result页面的标签页...');
        const allTabs = await new Promise((resolve) => {
          chrome.tabs.query({ currentWindow: true }, resolve);
        });
        
        if (!allTabs || allTabs.length === 0) {
          throw new Error('无法获取窗口中的标签页列表');
        }
        
        // 查找非result页面的标签页（排除chrome-extension://开头的页面）
        const nonExtensionTabs = allTabs.filter(tab => 
          !tab.url.startsWith('chrome-extension://') && 
          !tab.url.startsWith('chrome://') &&
          tab.url !== 'about:blank'
        );
        
        if (nonExtensionTabs.length === 0) {
          throw new Error('没有找到可用的原始页面标签页');
        }
        
        // 选择第一个非扩展页面标签页
        tabId = nonExtensionTabs[0].id;
        console.log(`🎯 找到可用标签页: ${nonExtensionTabs[0].url} (ID: ${tabId})`);
      }
      
      console.log('🎯 使用标签页ID:', tabId);
      
      const screenshots = [];
      
      console.log(`🎬 开始重新截图，总共${totalSteps}步...`);
      
      // 🔧 新增：滚动截图前的预备延迟
      console.log('⏱️ 滚动截图预备延迟，确保系统稳定...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒预备延迟
      
      // 重置滚动位置到顶部
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: 0 }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('发送滚动消息失败:', chrome.runtime.lastError.message || chrome.runtime.lastError);
          }
          setTimeout(resolve, 500);
        });
      });
      
      // 🔧 关键修复：添加循环监控和错误处理
      let successfulSteps = 0;
      let failedSteps = 0;
      
      // 逐步滚动并截图
      for (let step = 0; step < totalSteps; step++) {
        const scrollY = step * scrollStep;
        
        console.log(`📸 重新生成第 ${step + 1}/${totalSteps} 步，滚动到: ${scrollY}px`);
        
        try {
          // 滚动到指定位置
          await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: scrollY }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn(`滚动到${scrollY}失败:`, chrome.runtime.lastError.message || chrome.runtime.lastError);
              }
              setTimeout(resolve, 800); // 等待渲染
            });
          });
          
          // 🔧 关键修复：增加截图间延迟避免频率限制
          if (step > 0) {
            console.log(`⏱️ 截图间延迟，避免频率限制...`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // 🔧 修复：增加到3秒间隔
          }
          
          // 截图（带重试机制）
          const dataUrl = await new Promise((resolve, reject) => {
            let retryCount = 0;
            const maxRetries = 3;
            
            const attemptCapture = () => {
              // 🔧 关键修复：captureVisibleTab需要windowId，不是tabId
              // 先获取tab的windowId，如果失败则使用当前窗口
              chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError) {
                  console.warn('无法获取tab信息，使用当前窗口:', chrome.runtime.lastError.message || chrome.runtime.lastError);
                  // 如果获取失败，使用null（当前窗口）
                  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                      const error = chrome.runtime.lastError.message;
                      console.error(`❌ 第${step + 1}步截图失败:`, error);
                      
                      if (retryCount < maxRetries - 1 && 
                          (error.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') || 
                           error.includes('not in effect'))) {
                        retryCount++;
                        // 🔧 修复：针对不同错误类型使用不同延迟
                        let delay;
                        if (error.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
                          delay = 5000; // 频率限制错误：5秒延迟
                        } else if (error.includes('not in effect') || error.includes('permission')) {
                          delay = 2000; // 权限错误：2秒延迟
                        } else {
                          delay = 1000; // 其他错误：1秒延迟
                        }
                        console.log(`⏱️ 第${step + 1}步重试${retryCount}，等待${delay}ms...`);
                        setTimeout(attemptCapture, delay);
                      } else {
                        reject(new Error(`第${step + 1}步截图失败: ${error}`));
                      }
                    } else {
                      console.log(`✅ 第 ${step + 1} 步重新截图完成`);
                      resolve(dataUrl);
                    }
                  });
                } else {
                  // 使用tab的windowId进行截图
                  chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                      const error = chrome.runtime.lastError.message;
                      console.error(`❌ 第${step + 1}步截图失败:`, error);
                      
                      if (retryCount < maxRetries - 1 && 
                          (error.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') || 
                           error.includes('not in effect'))) {
                        retryCount++;
                        // 🔧 修复：针对不同错误类型使用不同延迟
                        let delay;
                        if (error.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
                          delay = 5000; // 频率限制错误：5秒延迟
                        } else if (error.includes('not in effect') || error.includes('permission')) {
                          delay = 2000; // 权限错误：2秒延迟
                        } else {
                          delay = 1000; // 其他错误：1秒延迟
                        }
                        console.log(`⏱️ 第${step + 1}步重试${retryCount}，等待${delay}ms...`);
                        setTimeout(attemptCapture, delay);
                      } else {
                        reject(new Error(`第${step + 1}步截图失败: ${error}`));
                      }
                    } else {
                      console.log(`✅ 第 ${step + 1} 步重新截图完成`);
                      resolve(dataUrl);
                    }
                  });
                }
              });
            };
            
            attemptCapture();
          });
          
          // 🔧 关键修复：验证截图数据
          if (!dataUrl || dataUrl.length < 100) {
            console.warn(`⚠️ 第${step + 1}步截图数据异常，长度: ${dataUrl ? dataUrl.length : 'undefined'}`);
            failedSteps++;
            // 仍然添加到数组，但标记为可能有问题
          } else {
            console.log(`✅ 第${step + 1}步截图成功，数据长度: ${dataUrl.length}`);
            successfulSteps++;
          }
          
          screenshots.push(dataUrl);
          
        } catch (stepError) {
          console.error(`❌ 第${step + 1}步处理失败:`, stepError);
          failedSteps++;
          
          // 🔧 关键修复：如果前几步就失败，直接抛出错误
          if (step < 2 && screenshots.length === 0) {
            throw new Error(`滚动截图在第${step + 1}步失败，无法继续: ${stepError.message}`);
          }
          
          // 如果已经有一些成功的截图，继续但警告
          console.warn(`⚠️ 跳过失败的第${step + 1}步，继续处理...`);
        }
      }
      
      // 🔧 关键修复：验证截图结果
      console.log(`📊 截图统计: 成功${successfulSteps}张, 失败${failedSteps}张, 总计${screenshots.length}张`);
      
      if (screenshots.length === 0) {
        throw new Error('滚动截图重新生成失败：没有成功截取任何图片');
      }
      
      if (screenshots.length < totalSteps * 0.5) {
        console.warn(`⚠️ 截图成功率较低: ${screenshots.length}/${totalSteps} (${(screenshots.length/totalSteps*100).toFixed(1)}%)`);
      }
      
      console.log(`🎉 重新截图完成，开始拼接${screenshots.length}张图片...`);
      
      // 计算重叠像素
      const overlap = Math.floor(actualViewportHeight * 0.15);
      
      // 🔧 关键修复：添加拼接前的最终验证
      const validScreenshots = screenshots.filter(img => img && img.length > 100);
      if (validScreenshots.length === 0) {
        throw new Error('所有截图数据都无效，无法进行拼接');
      }
      
      if (validScreenshots.length < screenshots.length) {
        console.warn(`⚠️ 过滤掉${screenshots.length - validScreenshots.length}张无效截图，使用${validScreenshots.length}张有效截图`);
      }
      
      // 拼接图片
      const stitchedDataUrl = await stitchImages(validScreenshots, overlap);
      console.log('✅ 滚动截图重新生成并拼接完成');
      
      return stitchedDataUrl;
      
    } catch (error) {
      console.error('❌ 重新生成滚动截图失败:', error);
      throw error;
    }
  }

  // 🔧 主要的加载和处理逻辑（带重试机制）
  async function processScreenshot() {
    try {
      const result = await loadScreenshotData(loadAttempt);
      
      if (!result.success) {
        showMessage(`获取数据失败: ${result.error}`, 'error');
        return;
      }

      const { dataSource, shouldStitch, mainImageData, stitchData, allData, scrollingMetadata } = result;
      
      if (!mainImageData && !stitchData && !scrollingMetadata) {
        // 🔧 重试机制：数据可能还未完全写入，或者需要等待更长时间
        if (loadAttempt < 5) {
          console.log(`⏱️ 第${loadAttempt}次尝试未找到数据，等待重试...`);
          setTimeout(() => processScreenshot(), 1000 + (loadAttempt * 500));
        } else {
          console.error('❌ 多次重试后仍无法获取截图数据');
          showMessage('无法获取截图数据，请返回重新截图', 'error');
          // 显示重新截图的提示
          screenshotPreview.style.display = 'none';
          const messageDiv = document.createElement('div');
          messageDiv.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #666;">
              <h3>没有找到截图数据</h3>
              <p>请返回扩展页面重新进行截图</p>
              <button onclick="window.close()" style="padding: 10px 20px; margin-top: 10px;">关闭页面</button>
            </div>
          `;
          document.querySelector('.result-container').appendChild(messageDiv);
        }
        return;
      }

      let finalImageData = null;
      
      console.log(`📊 数据源: ${dataSource}`);
      console.log('需要拼接:', shouldStitch);
      
      if (shouldStitch) {
        console.log('🔄 开始图像拼接处理...');
        
        if (dataSource === 'scrolling_regenerate') {
          // 🔧 新增：处理需要重新生成的滚动截图
          console.log('🔄 检测到需要重新生成滚动截图');
          showMessage('正在重新生成滚动截图...', 'info');
          
          try {
            // 🔧 关键修复：添加元数据验证
            if (!scrollingMetadata) {
              throw new Error('滚动截图元数据缺失');
            }
            
            // 验证关键字段
            const requiredFields = ['totalSteps', 'scrollStep', 'actualViewportHeight'];
            const missingFields = requiredFields.filter(field => !scrollingMetadata[field]);
            if (missingFields.length > 0) {
              throw new Error(`滚动截图元数据不完整，缺少: ${missingFields.join(', ')}`);
            }
            
            console.log('📊 元数据验证通过，开始重新生成...');
            
            // 🔧 关键修复：添加30秒超时保护机制
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('滚动截图重新生成超时（30秒），使用现有截图'));
              }, 30000);
            });
            
            const regeneratePromise = regenerateScrollingScreenshot(scrollingMetadata);
            
            // 使用Promise.race实现超时控制
            finalImageData = await Promise.race([regeneratePromise, timeoutPromise]);
            showMessage('滚动截图重新生成完成！', 'success');
          } catch (regenerateError) {
            console.error('❌ 重新生成失败，使用现有数据:', regenerateError);
            
            // 🔧 改进：根据错误类型提供不同的用户提示
            if (regenerateError.message.includes('超时')) {
              showMessage('重新生成超时，使用现有截图', 'warning');
            } else if (regenerateError.message.includes('元数据')) {
              showMessage('滚动截图数据不完整，使用现有截图', 'warning');
            } else if (regenerateError.message.includes('权限') || regenerateError.message.includes('permission')) {
              showMessage('权限不足，请重新授权后重试', 'error');
            } else if (regenerateError.message.includes('标签页') || regenerateError.message.includes('tab')) {
              showMessage('原始页面已关闭，使用现有截图', 'warning');
            } else {
              showMessage('重新生成失败，使用现有截图: ' + regenerateError.message, 'warning');
            }
            
            // 🔧 关键修复：确保有fallback数据
            finalImageData = mainImageData;
            if (!finalImageData && stitchData && stitchData.length > 0) {
              // 如果没有主图片数据，尝试使用拼接数据的第一张
              console.log('🔄 使用拼接数据的第一张作为fallback');
              finalImageData = stitchData[0];
            }
            
            if (!finalImageData) {
              throw new Error('没有可用的截图数据');
            }
          }
          
        } else if (stitchData && stitchData.length > 1) {
          // 现有的拼接逻辑
          console.log(`🧩 拼接 ${stitchData.length} 张图片...`);
          showMessage('正在拼接图片...', 'info');
          
          const overlap = parseInt(allData.pendingStitchOverlap || allData.manual_stitch_overlap || 0);
          console.log('使用重叠像素:', overlap);
          
          const stitchedImage = await stitchImages(stitchData, overlap);
          
          // 🔧 新增：检查是否需要宽度裁剪（手动+滚动模式）
          const needsWidthCropping = scrollingMetadata?.needsWidthCropping || 
                                   allData.scrollingMetadata?.needsWidthCropping || 
                                   (allData.captureType === 'manual-scrolling' && allData.selectionArea);
          const selectionArea = allData.selectionArea;
          
          console.log('🔍 宽度裁剪检查:');
          console.log('  - needsWidthCropping:', needsWidthCropping);
          console.log('  - captureType:', allData.captureType);
          console.log('  - selectionArea:', selectionArea);
          
          if (needsWidthCropping && selectionArea && selectionArea.width && selectionArea.x !== undefined) {
            console.log('📎 执行手动+滚动截图的宽度裁剪...');
            console.log('选择区域:', selectionArea);
            showMessage('正在进行宽度裁剪...', 'info');
            
            try {
              finalImageData = await cropWidthAfterStitching(stitchedImage, selectionArea);
              showMessage('手动+滚动截图宽度裁剪完成！', 'success');
              console.log('✅ 宽度裁剪完成');
            } catch (croppingError) {
              console.error('❌ 宽度裁剪失败:', croppingError);
              showMessage('宽度裁剪失败，使用完整拼接图像', 'warning');
              finalImageData = stitchedImage;
            }
          } else {
            finalImageData = stitchedImage;
            showMessage('图片拼接完成！', 'success');
          }
        } else {
          console.warn('⚠️ 需要拼接但没有足够的图片数据，使用主图片');
          finalImageData = mainImageData;
        }
      } else {
        finalImageData = mainImageData;
      }

      // 显示最终图片
      if (finalImageData) {
        originalDataUrl = finalImageData;
        
        // 🔧 关键修复：实现完整的裁剪逻辑
        needsCropping = allData.needsCropping || allData.manual_needs_cropping || false;
        selectionArea = allData.selectionArea || allData.manual_selection_area || null;
        
        console.log('🎯 检查裁剪需求:');
        console.log('  - needsCropping:', needsCropping);
        console.log('  - selectionArea:', selectionArea);
        
        if (needsCropping && selectionArea) {
          console.log('✂️ 开始裁剪选择区域...');
          showMessage('正在裁剪选择区域...', 'info');
          
          try {
            // 使用cropImage函数裁剪选择区域
            const croppedDataUrl = await cropImageFromCanvas(finalImageData, selectionArea);
            console.log('✅ 区域裁剪完成');
            
            screenshotPreview.src = croppedDataUrl;
            originalDataUrl = croppedDataUrl; // 更新原始数据为裁剪后的图片
            showMessage('区域裁剪完成！', 'success');
          } catch (error) {
            console.error('❌ 裁剪失败:', error);
            showMessage('裁剪失败，显示完整截图: ' + error.message, 'warning');
            screenshotPreview.src = finalImageData; // 失败时显示原图
          }
        } else {
          screenshotPreview.src = finalImageData;
        }
        
        screenshotPreview.style.display = 'block';
        showMessage('截图加载完成！', 'success');
      } else {
        showMessage('未能获取有效的图片数据', 'error');
      }
      
    } catch (error) {
      showMessage(`处理失败: ${error.message}`, 'error');
      
      // 重试机制
      if (loadAttempt < 3) {
        setTimeout(() => processScreenshot(), 2000);
      }
    }
  }

  // 应用圆角
  function applyCornerRadius() {
    if (!originalDataUrl) return;

    const radius = parseInt(cornerRadius.value);
    
    if (radius === 0) {
      screenshotPreview.src = originalDataUrl;
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      // 创建圆角路径
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
      ctx.clip();
      
      // 绘制图像
      ctx.drawImage(img, 0, 0);
      
      const processedDataUrl = canvas.toDataURL('image/png');
      screenshotPreview.src = processedDataUrl;
    };
    img.src = originalDataUrl;
  }

  // 保存并下载
  function saveScreenshot() {
    if (!screenshotPreview.src) {
      showMessage('没有可下载的截图', 'error');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = screenshotPreview.src;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `ArcShot-${timestamp}.png`;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showMessage('截图下载完成', 'success');
    } catch (error) {
      showMessage(`下载失败: ${error.message}`, 'error');
    }
  }

  // 事件监听器
  cornerRadius.addEventListener('input', applyCornerRadius);
  saveBtn.addEventListener('click', saveScreenshot);

  // 🔧 启动加载流程（带重试机制）
  processScreenshot();
  
  // 备用重试机制
  setTimeout(() => {
    if (!originalDataUrl) {
      processScreenshot();
    }
  }, 1000);
  
  setTimeout(() => {
    if (!originalDataUrl) {
      processScreenshot();
    }
  }, 3000);
}); 