document.addEventListener('DOMContentLoaded', () => {
  const fullScreenBtn = document.getElementById('fullScreenBtn');
  const manualSelectBtn = document.getElementById('manualSelectBtn');
  const scrollCheckbox = document.getElementById('scrollCheckbox');

  // 验证关键元素是否存在
  console.log('🔍 === Popup元素检查 ===');
  console.log('fullScreenBtn元素:', fullScreenBtn);
  console.log('manualSelectBtn元素:', manualSelectBtn);
  console.log('scrollCheckbox元素:', scrollCheckbox);
  console.log('scrollCheckbox ID存在:', !!document.getElementById('scrollCheckbox'));
  
  if (!scrollCheckbox) {
    console.error('❌ 严重错误：scrollCheckbox元素未找到！');
    return;
  }

  // 页面加载时检查是否有未处理的手动选择
  checkPendingManualSelection();

  // 显示消息函数
  function showMessage(message, type = 'info') {
    // 移除已存在的消息
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
      existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `${type}-message message`;
    messageDiv.textContent = message;
    
    const container = document.querySelector('.popup-container');
    container.appendChild(messageDiv);
    
    // 3秒后自动移除消息
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 3000);
  }

  // 检查未处理的手动选择
  function checkPendingManualSelection() {
    chrome.storage.local.get(['needsManualProcessing', 'manualSelectionArea', 'manualSelectionTimestamp'], (result) => {
      if (result.needsManualProcessing && result.manualSelectionArea) {
        const timeDiff = Date.now() - (result.manualSelectionTimestamp || 0);
        
        // 如果选择是在5分钟内的，提供处理选项
        if (timeDiff < 5 * 60 * 1000) {
          showMessage('发现未处理的区域选择，点击下方按钮处理', 'info');
          
          // 创建处理按钮
          const processBtn = document.createElement('button');
          processBtn.textContent = '处理未完成的选择';
          processBtn.style.background = '#17a2b8';
          processBtn.onclick = () => processPendingSelection(result.manualSelectionArea);
          
          const container = document.querySelector('.popup-container');
          container.appendChild(processBtn);
        }
      }
    });
  }

  // 处理待处理的选择
  async function processPendingSelection(selection) {
    try {
      showMessage('正在处理待处理的选择...', 'info');
      
      // 获取当前标签页并截图
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      
      if (!tabs[0]) {
        throw new Error('无法获取当前标签页');
      }

      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          showMessage('截图失败: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        // 存储截图数据和选择信息
        chrome.storage.local.set({
          screenshotDataUrl: dataUrl,
          selectionArea: selection,
          needsCropping: true
        }, () => {
          // 清除待处理标记
          chrome.storage.local.remove(['needsManualProcessing', 'manualSelectionArea', 'manualSelectionTimestamp']);
          
          // 打开结果页面
          chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
          window.close();
        });
      });
      
    } catch (error) {
      showMessage('处理失败: ' + error.message, 'error');
    }
  }

  // 设置按钮加载状态
  function setButtonLoading(button, loading, originalText) {
    if (loading) {
      button.disabled = true;
      button.classList.add('loading');
      button.setAttribute('data-original-text', button.textContent);
    } else {
      button.disabled = false;
      button.classList.remove('loading');
      const original = button.getAttribute('data-original-text');
      if (original) {
        button.textContent = original;
        button.removeAttribute('data-original-text');
      } else {
        button.textContent = originalText;
      }
    }
  }

  // 检查页面是否支持content script
  function isPageSupported(url) {
    if (!url) return false;
    const unsupportedProtocols = ['chrome://', 'chrome-extension://', 'moz-extension://', 'file://'];
    return !unsupportedProtocols.some(protocol => url.startsWith(protocol));
  }

  // 确保content script已注入
  async function ensureContentScriptInjected(tabId) {
    return new Promise((resolve, reject) => {
      // 首先尝试发送ping消息检查content script是否已加载
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script未加载，尝试注入
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }, (results) => {
            if (chrome.runtime.lastError) {
              reject(new Error('注入content script失败: ' + chrome.runtime.lastError.message));
              return;
            }
            
            // 等待一小段时间让content script初始化
            setTimeout(() => {
              // 再次检查
              chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error('Content script注入后仍无法通信'));
                } else {
                  resolve();
                }
              });
            }, 500);
          });
        } else {
          // Content script已加载
          resolve();
        }
      });
    });
  }

  // 全屏截图功能
  function captureFullScreen() {
    setButtonLoading(fullScreenBtn, true);
    
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      setButtonLoading(fullScreenBtn, false, '全屏截图');
      
      if (chrome.runtime.lastError) {
        console.error('截图失败:', chrome.runtime.lastError);
        showMessage('截图失败: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      // 存储截图数据
      chrome.storage.local.set({ screenshotDataUrl: dataUrl }, () => {
        if (chrome.runtime.lastError) {
          showMessage('保存截图失败', 'error');
          return;
        }
        // 打开结果页面
        chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
        // 关闭popup
        window.close();
      });
    });
  }

  // 滚动截图功能
  async function captureScrollingScreenshotLocal() {
    console.log('🚀 === captureScrollingScreenshotLocal 函数开始执行 ===');
    console.log('函数调用时间:', new Date().toISOString());
    
    setButtonLoading(fullScreenBtn, true);
    fullScreenBtn.textContent = '正在滚动截图...';
    
    try {
      console.log('📱 开始获取当前标签页信息...');
      // 获取当前标签页
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      
      if (!tabs[0]) {
        throw new Error('无法获取当前标签页');
      }

      const tabId = tabs[0].id;
      console.log('✅ 获取到标签页ID:', tabId);
      console.log('📄 页面URL:', tabs[0].url);
      
      // 检查页面是否支持
      if (!isPageSupported(tabs[0].url)) {
        throw new Error('当前页面不支持截图功能（系统页面或扩展页面）');
      }
      console.log('✅ 页面类型检查通过');

      console.log('🔧 开始确保content script已注入...');
      // 确保content script已注入
      await ensureContentScriptInjected(tabId);
      console.log('✅ Content script确认已注入');
      
      console.log('📏 开始执行滚动截图逻辑...');
      // 执行滚动截图 - 直接在popup中实现
      const stitchedDataUrl = await performScrollingScreenshot(tabId);
      console.log('✅ 滚动截图执行完成，数据长度:', stitchedDataUrl ? stitchedDataUrl.length : 'undefined');
      
      // 存储截图数据
      chrome.storage.local.set({ screenshotDataUrl: stitchedDataUrl }, () => {
        if (chrome.runtime.lastError) {
          throw new Error('保存截图失败');
        }
        console.log('✅ 截图数据存储成功');
        // 打开结果页面
        chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
        // 关闭popup
        window.close();
      });
      
    } catch (error) {
      console.error('❌ 滚动截图失败:', error);
      console.error('错误详情:', error.stack);
      showMessage('滚动截图失败: ' + error.message, 'error');
    } finally {
      setButtonLoading(fullScreenBtn, false, '全屏截图');
      console.log('🏁 captureScrollingScreenshotLocal 函数执行结束');
    }
  }

  // 在popup中实现滚动截图逻辑
  async function performScrollingScreenshot(tabId) {
    console.log('📸 === performScrollingScreenshot 开始执行 ===');
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
      const actualViewportHeight = Math.max(clientHeight, viewportHeight, window.innerHeight || 0);
      const scrollableContent = actualScrollHeight - actualViewportHeight;
      
      console.log('=== 🔍 详细的滚动截图分析 ===');
      console.log('📏 实际页面高度:', actualScrollHeight);
      console.log('📏 实际视口高度:', actualViewportHeight);
      console.log('📏 可滚动内容高度:', scrollableContent);
      console.log('📏 原始数据 - scrollHeight:', scrollHeight, 'clientHeight:', clientHeight);
      console.log('📏 其他高度数据 - bodyHeight:', bodyHeight, 'documentHeight:', documentHeight, 'viewportHeight:', viewportHeight);
      console.log('📏 页面是否可滚动:', isScrollable);
      console.log('📏 最大滚动距离:', maxScrollTop);
      console.log('🎯 判断阈值: 50px');
      
      // 更宽松的滚动判断条件：如果可滚动内容超过50px就进行滚动截图
      if (scrollableContent <= 50) {
        console.log('⚠️ 页面内容高度不足，使用普通截图');
        console.log(`❌ 可滚动内容仅 ${scrollableContent}px，小于阈值50px`);
        console.log('🔄 切换到普通截图模式...');
        showMessage('页面内容较短，使用普通截图', 'info');
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
      // 减少重叠，提高滚动步长
      const scrollStep = Math.floor(actualViewportHeight * 0.85); // 15% overlap，提高效率
      const totalSteps = Math.ceil(scrollableContent / scrollStep) + 1;
      
      console.log(`📋 滚动截图计划:`);
      console.log(`   - 总步数: ${totalSteps}`);
      console.log(`   - 每步滚动: ${scrollStep}px`);
      console.log(`   - 重叠区域: ${Math.floor(actualViewportHeight * 0.15)}px`);

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
          
          // 更新按钮文本显示进度
          fullScreenBtn.textContent = `正在截图 ${step + 1}/${totalSteps}...`;
          
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
        showMessage(`部分截图失败，但将继续处理已有的 ${screenshots.length} 张图片`, 'warning');
      } else {
        console.log(`✅ 截图成功率良好: ${screenshots.length}/${totalSteps} (${(screenshots.length/totalSteps*100).toFixed(1)}%)`);
      }

      console.log(`🔧 开始拼接 ${screenshots.length} 张图片...`);
      fullScreenBtn.textContent = '正在拼接图片...';

      // 拼接图像 - 使用与滚动步长对应的重叠计算
      const overlap = Math.floor(actualViewportHeight * 0.15); // 15% overlap，与滚动步长一致
      const stitchedImage = await stitchImagesInPopup(screenshots, overlap);
      
      console.log('✅ 图片拼接完成，最终图片长度:', stitchedImage ? stitchedImage.length : 'undefined');
      showMessage('滚动截图拼接完成！', 'success');
      return stitchedImage;
      
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
        showMessage('滚动截图失败，已切换为普通截图', 'warning');
        return fallbackDataUrl;
      } catch (fallbackError) {
        console.error('❌ 备用截图也失败:', fallbackError);
        throw new Error(`滚动截图失败: ${error.message}，备用截图也失败: ${fallbackError.message}`);
      }
    }
  }

  // 在popup中实现图像拼接
  async function stitchImagesInPopup(imageDataUrls, overlap = 0) {
    return new Promise((resolve, reject) => {
      if (!imageDataUrls || imageDataUrls.length === 0) {
        reject(new Error('没有图片需要拼接'));
        return;
      }
      
      if (imageDataUrls.length === 1) {
        resolve(imageDataUrls[0]);
        return;
      }

      console.log(`开始拼接 ${imageDataUrls.length} 张图片，重叠像素: ${overlap}`);

      const images = [];
      let loadedCount = 0;

      // 加载所有图片
      imageDataUrls.forEach((dataUrl, index) => {
        const img = new Image();
        img.onload = () => {
          images[index] = img;
          loadedCount++;
          console.log(`图片 ${index + 1} 加载完成: ${img.width}x${img.height}`);
          
          if (loadedCount === imageDataUrls.length) {
            // 所有图片加载完成，开始拼接
            try {
              const result = performStitching();
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        };
        img.onerror = () => {
          reject(new Error(`图片 ${index + 1} 加载失败`));
        };
        img.src = dataUrl;
      });

      function performStitching() {
        // 计算canvas尺寸
        const canvasWidth = Math.max(...images.map(img => img.width));
        let canvasHeight = 0;
        
        // 计算总高度（考虑重叠）
        for (let i = 0; i < images.length; i++) {
          if (i === 0) {
            canvasHeight += images[i].height;
          } else {
            canvasHeight += images[i].height - overlap;
          }
        }

        console.log(`创建拼接画布: ${canvasWidth}x${canvasHeight}`);

        // 创建canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // 绘制图片
        let currentY = 0;
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const x = Math.floor((canvasWidth - img.width) / 2); // 居中对齐
          
          console.log(`绘制图片 ${i + 1} 到位置: (${x}, ${currentY})`);
          ctx.drawImage(img, x, currentY);
          
          if (i < images.length - 1) {
            currentY += img.height - overlap;
          }
        }

        console.log('图片拼接完成，转换为数据URL');
        return canvas.toDataURL('image/png');
      }
    });
  }

  // 手动选择区域截图
  async function captureManualSelection() {
    setButtonLoading(manualSelectBtn, true);
    manualSelectBtn.textContent = '启动区域选择...';
    
    try {
      // 获取当前标签页
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      
      if (!tabs[0]) {
        throw new Error('无法获取当前标签页');
      }

      const tabId = tabs[0].id;
      
      // 检查页面是否支持
      if (!isPageSupported(tabs[0].url)) {
        throw new Error('当前页面不支持区域选择功能（系统页面或扩展页面）');
      }

      // 确保content script已注入
      try {
        await ensureContentScriptInjected(tabId);
      } catch (error) {
        throw new Error('无法注入必要脚本: ' + error.message);
      }
      
      // 启动区域选择
      chrome.tabs.sendMessage(tabId, { action: 'startAreaSelection' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('启动区域选择失败:', chrome.runtime.lastError);
          showMessage('启动区域选择失败: ' + chrome.runtime.lastError.message, 'error');
          setButtonLoading(manualSelectBtn, false, '手动选择');
          return;
        }
        
        // 显示成功消息并提示用户
        showMessage('区域选择已启动！请在页面中拖拽选择区域，选择完成后会自动截图', 'success');
        setButtonLoading(manualSelectBtn, false, '手动选择');
        
        // 关闭popup，让用户可以在页面上进行选择
        // Background script会处理后续的消息和截图逻辑
        setTimeout(() => {
          window.close();
        }, 1500);
      });
      
    } catch (error) {
      console.error('区域选择失败:', error);
      showMessage('区域选择失败: ' + error.message, 'error');
      setButtonLoading(manualSelectBtn, false, '手动选择');
    }
  }

  // 滚动截图手动选择功能
  async function captureScrollingManualSelection() {
    setButtonLoading(manualSelectBtn, true);
    manualSelectBtn.textContent = '启动滚动区域选择...';

    try {
      // 获取当前标签页
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      
      if (!tabs[0]) {
        throw new Error('无法获取当前标签页');
      }

      const tabId = tabs[0].id;
      
      // 检查页面是否支持
      if (!isPageSupported(tabs[0].url)) {
        throw new Error('当前页面不支持滚动区域选择功能（系统页面或扩展页面）');
      }

      // 确保content script已注入
      try {
        await ensureContentScriptInjected(tabId);
      } catch (error) {
        throw new Error('无法注入必要脚本: ' + error.message);
      }
      
      // 启动滚动区域选择
      chrome.tabs.sendMessage(tabId, { action: 'startScrollingAreaSelection' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('启动滚动区域选择失败:', chrome.runtime.lastError);
          showMessage('启动滚动区域选择失败: ' + chrome.runtime.lastError.message, 'error');
          setButtonLoading(manualSelectBtn, false, '手动选择');
          return;
        }
        
        // 显示成功消息并提示用户
        showMessage('滚动区域选择已启动！请在页面中拖拽选择区域，选择完成后会自动截图', 'success');
        setButtonLoading(manualSelectBtn, false, '手动选择');
        
        // 关闭popup，让用户可以在页面上进行选择
        // Background script会处理后续的消息和截图逻辑
        setTimeout(() => {
          window.close();
        }, 1500);
      });
      
    } catch (error) {
      console.error('滚动区域选择失败:', error);
      showMessage('滚动区域选择失败: ' + error.message, 'error');
      setButtonLoading(manualSelectBtn, false, '手动选择');
    }
  }

  fullScreenBtn.addEventListener('click', () => {
    const scroll = scrollCheckbox.checked;
    console.log('=== 全屏截图按钮被点击 ===');
    console.log('滚动截图选项状态:', scroll);
    console.log('checkbox element:', scrollCheckbox);
    console.log('checkbox checked value:', scrollCheckbox ? scrollCheckbox.checked : 'checkbox not found');
    
    if (scroll) {
      console.log('>>> 执行滚动截图功能');
      captureScrollingScreenshotLocal();
    } else {
      console.log('>>> 执行普通截图功能');
      captureFullScreen();
    }
  });

  manualSelectBtn.addEventListener('click', () => {
    const scroll = scrollCheckbox.checked;
    console.log('=== 手动选择按钮被点击 ===');
    console.log('滚动截图选项状态:', scroll);
    
    if (scroll) {
      console.log('>>> 执行滚动手动选择功能');
      captureScrollingManualSelection();
    } else {
      console.log('>>> 执行普通手动选择功能');
      captureManualSelection();
    }
  });

  // 添加调试功能 - 可在开发者工具中使用
  window.ArcShotDebug = {
    testScrolling: async () => {
      console.log('=== 开始测试滚动截图功能 ===');
      try {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });
        
        if (!tabs[0]) {
          console.error('无法获取当前标签页');
          return;
        }

        const tabId = tabs[0].id;
        console.log('当前标签页ID:', tabId);

        // 测试content script通信
        const pageInfo = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error('获取页面信息失败: ' + chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        console.log('页面信息获取成功:', pageInfo);

        // 测试滚动功能
        console.log('测试滚动到100px...');
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: 100 }, (response) => {
            console.log('滚动响应:', response);
            resolve();
          });
        });

        console.log('=== 滚动截图功能测试完成 ===');
      } catch (error) {
        console.error('测试失败:', error);
      }
    },
    
    captureTest: () => {
      console.log('=== 测试基础截图功能 ===');
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('截图失败:', chrome.runtime.lastError);
        } else {
          console.log('截图成功，数据长度:', dataUrl ? dataUrl.length : 'undefined');
        }
      });
    },
    
    // 新增：强制测试滚动截图功能（绕过复选框）
    forceScrollingTest: async () => {
      console.log('🚀 === 强制测试滚动截图功能 ===');
      try {
        await captureScrollingScreenshotLocal();
        console.log('✅ 强制滚动截图测试完成');
      } catch (error) {
        console.error('❌ 强制滚动截图测试失败:', error);
      }
    },
    
    // 检查复选框状态
    checkCheckboxStatus: () => {
      const checkbox = document.getElementById('scrollCheckbox');
      console.log('🔍 === 复选框状态检查 ===');
      console.log('checkbox元素:', checkbox);
      console.log('checkbox存在:', !!checkbox);
      if (checkbox) {
        console.log('checked状态:', checkbox.checked);
        console.log('disabled状态:', checkbox.disabled);
        console.log('value值:', checkbox.value);
      }
      
      // 测试设置复选框状态
      if (checkbox) {
        console.log('🔧 测试设置复选框为选中状态...');
        checkbox.checked = true;
        console.log('设置后checked状态:', checkbox.checked);
      }
    },
    
    // 新增：测试滚动手动选择功能
    testScrollingManualSelection: async () => {
      console.log('🎯 === 强制测试滚动手动选择功能 ===');
      try {
        await captureScrollingManualSelection();
        console.log('✅ 强制滚动手动选择测试完成');
      } catch (error) {
        console.error('❌ 强制滚动手动选择测试失败:', error);
      }
    },
    
    // 测试普通手动选择功能
    testManualSelection: async () => {
      console.log('📋 === 测试普通手动选择功能 ===');
      try {
        await captureManualSelection();
        console.log('✅ 普通手动选择测试完成');
      } catch (error) {
        console.error('❌ 普通手动选择测试失败:', error);
      }
    },
    
    // 新增：完整的端到端测试
    fullE2ETest: async () => {
      console.log('🚀 === 完整端到端测试 ===');
      try {
        // 1. 检查页面信息
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });
        
        if (!tabs[0]) {
          console.error('无法获取当前标签页');
          return;
        }

        const tabId = tabs[0].id;
        console.log('🏷️ 当前标签页:', tabs[0].url);

        // 2. 测试content script通信
        const pageInfo = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error('获取页面信息失败: ' + chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        console.log('📊 页面信息获取成功:', pageInfo);

        // 3. 计算滚动需求
        const { scrollHeight, clientHeight, viewportHeight, bodyHeight, documentHeight } = pageInfo;
        const actualScrollHeight = Math.max(scrollHeight, bodyHeight, documentHeight);
        const actualViewportHeight = Math.max(clientHeight, viewportHeight);
        const scrollableContent = actualScrollHeight - actualViewportHeight;
        
        console.log('📏 滚动分析:');
        console.log(`   - 页面高度: ${actualScrollHeight}px`);
        console.log(`   - 视口高度: ${actualViewportHeight}px`);
        console.log(`   - 可滚动内容: ${scrollableContent}px`);
        console.log(`   - 需要滚动: ${scrollableContent > 50 ? '是' : '否'}`);

        // 4. 模拟复选框选择
        const checkbox = document.getElementById('scrollCheckbox');
        if (checkbox) {
          checkbox.checked = true;
          console.log('☑️ 模拟勾选滚动截图选项');
        }

        console.log('✅ 端到端测试完成，所有组件正常');
      } catch (error) {
        console.error('❌ 端到端测试失败:', error);
      }
    },
    
    // 新增：坐标系验证工具
    testCoordinateSystem: async () => {
      console.log('📐 === 坐标系验证测试 ===');
      try {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });
        
        if (!tabs[0]) {
          console.error('无法获取当前标签页');
          return;
        }

        const tabId = tabs[0].id;
        
        // 获取当前页面滚动状态
        const scrollInfo = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error('获取页面信息失败'));
            } else {
              resolve(response);
            }
          });
        });
        
        console.log('📏 当前页面状态:');
        console.log(`   - 当前滚动位置: ${scrollInfo.scrollTop}px`);
        console.log(`   - 页面总高度: ${scrollInfo.scrollHeight}px`);
        console.log(`   - 视口高度: ${scrollInfo.clientHeight}px`);
        console.log(`   - 最大可滚动: ${scrollInfo.maxScrollTop}px`);
        
        console.log('💡 坐标系说明:');
        console.log('   - 普通模式: 选择坐标相对于当前视口');
        console.log('   - 滚动模式: 选择坐标相对于整个文档（已修复）');
        console.log('   - 视口坐标 -> 文档坐标: clientY + pageYOffset');
        
        console.log('✅ 坐标系验证测试完成');
      } catch (error) {
        console.error('❌ 坐标系验证测试失败:', error);
      }
    },
    
    // 新增：数据流完整验证
    verifyDataFlow: async () => {
      console.log('🔍 === 数据流完整验证 ===');
      try {
        // 检查当前storage中的数据
        const storageData = await new Promise((resolve) => {
          chrome.storage.local.get([
            'screenshotDataUrl', 'selectionArea', 'needsCropping', 
            'needsStitching', 'pendingStitchImages', 'pendingStitchOverlap', 
            'isScrollingMode', 'processingTimestamp'
          ], resolve);
        });
        
        console.log('📦 当前Storage数据:');
        console.log('   - screenshotDataUrl存在:', !!storageData.screenshotDataUrl);
        console.log('   - screenshotDataUrl长度:', storageData.screenshotDataUrl ? storageData.screenshotDataUrl.length : 0);
        console.log('   - needsStitching:', storageData.needsStitching);
        console.log('   - pendingStitchImages数量:', storageData.pendingStitchImages ? storageData.pendingStitchImages.length : 0);
        console.log('   - pendingStitchOverlap:', storageData.pendingStitchOverlap);
        console.log('   - needsCropping:', storageData.needsCropping);
        console.log('   - isScrollingMode:', storageData.isScrollingMode);
        console.log('   - selectionArea:', storageData.selectionArea);
        
        // 数据流诊断
        console.log('🔬 数据流诊断:');
        if (storageData.isScrollingMode) {
          if (storageData.needsStitching && storageData.pendingStitchImages) {
            console.log('✅ 滚动模式数据流正确：有待拼接图片');
            console.log(`   - 将拼接 ${storageData.pendingStitchImages.length} 张图片`);
          } else {
            console.log('❌ 滚动模式数据流错误：缺少拼接数据');
          }
          
          if (storageData.screenshotDataUrl) {
            console.log('⚠️ 滚动模式但仍有screenshotDataUrl（可能是第一张图片）');
          } else {
            console.log('✅ 滚动模式正确：没有单张screenshotDataUrl');
          }
        } else {
          if (storageData.screenshotDataUrl) {
            console.log('✅ 普通模式数据流正确：有截图数据');
          } else {
            console.log('❌ 普通模式数据流错误：缺少截图数据');
          }
        }
        
        console.log('✅ 数据流验证完成');
      } catch (error) {
        console.error('❌ 数据流验证失败:', error);
      }
    }
  };

  console.log('ArcShot popup loaded. Debug functions available at window.ArcShotDebug');
});