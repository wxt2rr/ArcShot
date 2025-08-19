document.addEventListener('DOMContentLoaded', () => {
  const fullScreenBtn = document.getElementById('fullScreenBtn');
  const manualSelectBtn = document.getElementById('manualSelectBtn');
  const scrollCheckbox = document.getElementById('scrollCheckbox');

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
    setButtonLoading(fullScreenBtn, true);
    fullScreenBtn.textContent = '正在滚动截图...';
    
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
        throw new Error('当前页面不支持截图功能（系统页面或扩展页面）');
      }

      // 确保content script已注入
      await ensureContentScriptInjected(tabId);
      
      // 执行滚动截图 - 直接在popup中实现
      const stitchedDataUrl = await performScrollingScreenshot(tabId);
      
      // 存储截图数据
      chrome.storage.local.set({ screenshotDataUrl: stitchedDataUrl }, () => {
        if (chrome.runtime.lastError) {
          throw new Error('保存截图失败');
        }
        // 打开结果页面
        chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
        // 关闭popup
        window.close();
      });
      
    } catch (error) {
      console.error('滚动截图失败:', error);
      showMessage('滚动截图失败: ' + error.message, 'error');
    } finally {
      setButtonLoading(fullScreenBtn, false, '全屏截图');
    }
  }

  // 在popup中实现滚动截图逻辑
  async function performScrollingScreenshot(tabId) {
    console.log('开始执行滚动截图...');
    
    try {
      // 获取页面信息
      const pageInfo = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('获取页面信息失败: ' + chrome.runtime.lastError.message));
          } else {
            console.log('页面信息:', response);
            resolve(response);
          }
        });
      });

      const { scrollHeight, clientHeight } = pageInfo;
      
      // 检查是否需要滚动
      if (scrollHeight <= clientHeight * 1.1) { // 给一点容差
        console.log('页面高度不需要滚动，使用普通截图');
        showMessage('页面内容较短，使用普通截图', 'info');
        return new Promise((resolve, reject) => {
          chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
              reject(new Error('截图失败: ' + chrome.runtime.lastError.message));
            } else {
              resolve(dataUrl);
            }
          });
        });
      }

      console.log(`页面需要滚动截图: 总高度=${scrollHeight}, 可见高度=${clientHeight}`);

      const screenshots = [];
      const scrollStep = Math.floor(clientHeight * 0.8); // 20% overlap
      const totalSteps = Math.ceil((scrollHeight - clientHeight) / scrollStep) + 1;
      
      console.log(`计划截图步数: ${totalSteps}, 每步滚动: ${scrollStep}px`);

      // 重置滚动位置到顶部
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: 0 }, (response) => {
          console.log('重置到顶部:', response);
          setTimeout(resolve, 300); // 等待滚动完成
        });
      });

      let successfulSteps = 0;
      
      // 逐步滚动并截图
      for (let step = 0; step < totalSteps; step++) {
        const scrollY = step * scrollStep;
        
        console.log(`执行第 ${step + 1}/${totalSteps} 步，滚动到: ${scrollY}px`);
        
        try {
          // 滚动到指定位置
          const scrollResult = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: scrollY }, (response) => {
              console.log(`滚动响应:`, response);
              resolve(response);
            });
          });
          
          // 检查滚动是否成功
          if (!scrollResult || !scrollResult.success) {
            console.warn(`步骤 ${step + 1} 滚动可能失败:`, scrollResult);
          }
          
          // 等待页面渲染
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 截图
          const dataUrl = await new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                reject(new Error(`第${step + 1}步截图失败: ` + chrome.runtime.lastError.message));
              } else {
                console.log(`第 ${step + 1} 步截图完成，数据长度: ${dataUrl.length}`);
                resolve(dataUrl);
              }
            });
          });
          
          screenshots.push(dataUrl);
          successfulSteps++;
          
          // 更新按钮文本显示进度
          fullScreenBtn.textContent = `正在截图 ${step + 1}/${totalSteps}...`;
          
        } catch (stepError) {
          console.error(`步骤 ${step + 1} 失败:`, stepError);
          
          // 如果是前几步失败，直接抛出错误
          if (step < 2) {
            throw new Error(`滚动截图在第 ${step + 1} 步失败: ${stepError.message}`);
          }
          
          // 如果已经有一些成功的截图，继续但记录错误
          console.warn(`跳过步骤 ${step + 1}，继续下一步`);
        }
      }

      // 检查是否有足够的截图
      if (screenshots.length === 0) {
        throw new Error('没有成功截取任何图片');
      }
      
      if (screenshots.length < totalSteps * 0.7) {
        console.warn(`只成功截取了 ${screenshots.length}/${totalSteps} 张图片`);
        showMessage(`部分截图失败，但将继续处理已有的 ${screenshots.length} 张图片`, 'warning');
      }

      console.log(`所有截图完成，开始拼接 ${screenshots.length} 张图片`);
      fullScreenBtn.textContent = '正在拼接图片...';

      // 拼接图像
      const overlap = Math.floor(clientHeight * 0.2);
      const stitchedImage = await stitchImagesInPopup(screenshots, overlap);
      
      console.log('图片拼接完成');
      showMessage('滚动截图拼接完成！', 'success');
      return stitchedImage;
      
    } catch (error) {
      console.error('滚动截图过程出错:', error);
      
      // 尝试回退到普通截图
      console.log('尝试使用普通截图作为备用方案...');
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
        
        showMessage('滚动截图失败，已切换为普通截图', 'warning');
        return fallbackDataUrl;
      } catch (fallbackError) {
        console.error('备用截图也失败:', fallbackError);
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

  fullScreenBtn.addEventListener('click', () => {
    const scroll = scrollCheckbox.checked;
    if (scroll) {
      captureScrollingScreenshotLocal();
    } else {
      captureFullScreen();
    }
  });

  manualSelectBtn.addEventListener('click', () => {
    captureManualSelection();
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
    }
  };

  console.log('ArcShot popup loaded. Debug functions available at window.ArcShotDebug');
});