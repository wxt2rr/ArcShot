document.addEventListener('DOMContentLoaded', () => {
  const screenshotPreview = document.getElementById('screenshotPreview');
  const cornerRadiusInput = document.getElementById('cornerRadius');
  const saveBtn = document.getElementById('saveBtn');
  
  let originalDataUrl = null;
  let isProcessing = false;
  let needsCropping = false;
  let selectionArea = null;

  // 检查是否有处理错误
  checkProcessingErrors();

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
    
    const container = document.querySelector('.result-container');
    container.appendChild(messageDiv);
    
    // 5秒后自动移除消息
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 5000);
  }

  // 检查处理错误
  function checkProcessingErrors() {
    chrome.storage.local.get(['processingError', 'errorTimestamp'], (result) => {
      if (result.processingError) {
        const timeDiff = Date.now() - (result.errorTimestamp || 0);
        
        // 如果错误是在1分钟内的，显示错误信息
        if (timeDiff < 60 * 1000) {
          showMessage('处理过程中发生错误: ' + result.processingError, 'error');
          
          // 清除错误信息
          chrome.storage.local.remove(['processingError', 'errorTimestamp']);
        }
      }
    });
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

  // 获取截图数据
  chrome.storage.local.get(['screenshotDataUrl', 'selectionArea', 'needsCropping', 'isScrollingMode', 'needsStitching', 'pendingStitchImages', 'pendingStitchOverlap', 'scrollingMetadata'], async (result) => {
    if (chrome.runtime.lastError) {
      showMessage('获取截图数据失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    
    console.log('🔍 === Result.js 数据检查 ===');
    console.log('基础截图数据存在:', !!result.screenshotDataUrl);
    console.log('截图数据长度:', result.screenshotDataUrl ? result.screenshotDataUrl.length : 0);
    console.log('需要拼接:', result.needsStitching);
    console.log('待拼接图片数量:', result.pendingStitchImages ? result.pendingStitchImages.length : 0);
    console.log('滚动模式:', result.isScrollingMode);
    console.log('需要裁剪:', result.needsCropping);
    console.log('选择区域:', result.selectionArea);
    console.log('滚动元数据:', result.scrollingMetadata);
    
    // 首先检查是否需要在result.js中进行拼接
    if (result.needsStitching && result.pendingStitchImages && result.pendingStitchImages.length > 1) {
      console.log('🔧 在result.js中开始拼接多张图片（Service Worker环境限制）...');
      showMessage(`正在拼接 ${result.pendingStitchImages.length} 张图片，请稍候...`, 'info');
      
      try {
        const overlap = result.pendingStitchOverlap || 0;
        const stitchedDataUrl = await stitchImagesInResult(result.pendingStitchImages, overlap, result.scrollingMetadata);
        
        console.log('✅ 图片拼接完成，更新原始数据');
        originalDataUrl = stitchedDataUrl;
        
        // 验证拼接结果
        if (result.scrollingMetadata) {
          await validateStitchedImage(stitchedDataUrl, result.scrollingMetadata);
        }
        
        // 清除拼接相关的数据，更新存储的截图数据
        chrome.storage.local.set({
          screenshotDataUrl: stitchedDataUrl
        });
        chrome.storage.local.remove(['needsStitching', 'pendingStitchImages', 'pendingStitchOverlap', 'scrollingMetadata']);
        
        showMessage('图片拼接完成！', 'success');
      } catch (error) {
        console.error('❌ 图片拼接失败:', error);
        showMessage('图片拼接失败: ' + error.message, 'error');
        
        // 拼接失败，使用第一张图片作为备用
        if (result.pendingStitchImages && result.pendingStitchImages.length > 0) {
          originalDataUrl = result.pendingStitchImages[0];
          console.log('🔄 使用第一张图片作为备用');
        } else if (result.screenshotDataUrl) {
          originalDataUrl = result.screenshotDataUrl;
          console.log('🔄 使用基础截图数据作为备用');
        }
      }
    } else if (result.screenshotDataUrl) {
      originalDataUrl = result.screenshotDataUrl;
      console.log('📷 使用基础截图数据，长度:', originalDataUrl.length);
    } else if (result.pendingStitchImages && result.pendingStitchImages.length === 1) {
      // 特殊情况：滚动模式但只有一张图片
      originalDataUrl = result.pendingStitchImages[0];
      console.log('📷 滚动模式单张图片，直接使用');
      // 清除不需要的拼接数据
      chrome.storage.local.remove(['needsStitching', 'pendingStitchImages', 'pendingStitchOverlap', 'scrollingMetadata']);
    } else {
      // 没有任何可用的图片数据
      console.error('❌ 没有找到截图数据');
      showMessage('没有找到截图数据', 'error');
      
      // 添加一个返回按钮，让用户可以重新尝试
      const retryBtn = document.createElement('button');
      retryBtn.textContent = '返回重新截图';
      retryBtn.onclick = () => {
        chrome.tabs.getCurrent((tab) => {
          chrome.tabs.remove(tab.id);
        });
      };
      
      const container = document.querySelector('.result-container');
      container.appendChild(retryBtn);
      return;
    }
    
    if (originalDataUrl) {
      needsCropping = result.needsCropping || false;
      selectionArea = result.selectionArea || null;
      
      if (needsCropping && selectionArea) {
        // 需要裁剪，显示提示
        console.log('✂️ 开始处理区域裁剪...');
        console.log('📐 选择区域:', selectionArea);
        showMessage('正在处理手动选择的区域...', 'info');
        
        try {
          // 裁剪图像
          const croppedDataUrl = await cropImage(originalDataUrl, selectionArea);
          originalDataUrl = croppedDataUrl;
          
          // 清除裁剪标志
          chrome.storage.local.remove(['selectionArea', 'needsCropping', 'isScrollingMode']);
          
          showMessage(result.isScrollingMode ? '滚动区域裁剪完成！' : '区域裁剪完成！', 'success');
          console.log('✅ 区域裁剪完成');
        } catch (error) {
          console.error('❌ 裁剪失败:', error);
          showMessage('裁剪失败: ' + error.message, 'error');
        }
      } else {
        // 不需要裁剪，直接显示
        if (result.isScrollingMode) {
          showMessage('滚动截图完成！', 'success');
        }
      }
      
      // 显示截图预览
      screenshotPreview.src = originalDataUrl;
      screenshotPreview.onload = () => {
        if (!needsCropping) {
          showMessage('截图加载完成，可以调整圆角效果', 'success');
        }
        console.log('✅ 截图预览加载完成');
      };
      screenshotPreview.onerror = () => {
        showMessage('截图加载失败', 'error');
        console.error('❌ 截图预览加载失败');
      };
    }
  });

  // 裁剪图像函数
  async function cropImage(dataUrl, selectionArea) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          console.log('🖼️ 原始图片尺寸:', img.width, 'x', img.height);
          console.log('📐 裁剪区域:', selectionArea);
          
          // 验证裁剪区域是否在图片范围内
          const clampedSelection = {
            x: Math.max(0, Math.min(selectionArea.x, img.width)),
            y: Math.max(0, Math.min(selectionArea.y, img.height)),
            width: Math.min(selectionArea.width, img.width - Math.max(0, selectionArea.x)),
            height: Math.min(selectionArea.height, img.height - Math.max(0, selectionArea.y))
          };
          
          console.log('📐 调整后裁剪区域:', clampedSelection);
          
          // 确保裁剪区域有效
          if (clampedSelection.width <= 0 || clampedSelection.height <= 0) {
            throw new Error(`裁剪区域无效: ${clampedSelection.width}x${clampedSelection.height}`);
          }
          
          // 设置canvas尺寸为裁剪区域大小
          canvas.width = clampedSelection.width;
          canvas.height = clampedSelection.height;
          
          // 直接使用选择区域的坐标和尺寸，不进行设备像素比调整
          // 因为截图数据和选择坐标都是基于相同的坐标系统
          ctx.drawImage(
            img,
            clampedSelection.x,
            clampedSelection.y,
            clampedSelection.width,
            clampedSelection.height,
            0,
            0,
            clampedSelection.width,
            clampedSelection.height
          );
          
          console.log('✅ 裁剪完成，最终尺寸:', canvas.width, 'x', canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          console.error('❌ 裁剪过程出错:', error);
          reject(error);
        }
      };
      img.onerror = () => {
        reject(new Error('裁剪图像失败：无法加载原始图片'));
      };
      img.src = dataUrl;
    });
  }

  // 在result中实现图像拼接
  async function stitchImagesInResult(imageDataUrls, overlap = 0, metadata = null) {
    return new Promise((resolve, reject) => {
      if (!imageDataUrls || imageDataUrls.length === 0) {
        reject(new Error('没有图片需要拼接'));
        return;
      }
      
      if (imageDataUrls.length === 1) {
        resolve(imageDataUrls[0]);
        return;
      }

      console.log(`🔧 在result.js中拼接 ${imageDataUrls.length} 张图片，重叠像素: ${overlap}`);
      if (metadata) {
        console.log('📊 拼接元数据:', metadata);
      }

      const images = [];
      let loadedCount = 0;

      // 加载所有图片
      imageDataUrls.forEach((dataUrl, index) => {
        const img = new Image();
        img.onload = () => {
          images[index] = img;
          loadedCount++;
          console.log(`📸 图片 ${index + 1} 加载完成: ${img.width}x${img.height}`);
          
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
        console.log('🎨 开始在result.js中执行拼接逻辑...');
        console.log('🔄 使用popup.js中验证成功的拼接算法');
        
        // === 直接复制popup.js中成功的拼接逻辑 ===
        
        // 计算canvas尺寸
        const canvasWidth = Math.max(...images.map(img => img.width));
        let canvasHeight = 0;
        
        console.log('📏 图片尺寸分析:');
        images.forEach((img, index) => {
          console.log(`   图片 ${index + 1}: ${img.width}x${img.height}px`);
        });
        
        // 计算总高度（考虑重叠） - 使用popup.js的简洁算法
        for (let i = 0; i < images.length; i++) {
          if (i === 0) {
            canvasHeight += images[i].height;
          } else {
            canvasHeight += images[i].height - overlap;
          }
        }

        console.log(`创建拼接画布: ${canvasWidth}x${canvasHeight}px`);

        // 创建canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // 绘制图片 - 使用popup.js的简洁算法
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

        console.log('✅ 图片拼接完成，转换为数据URL');
        return canvas.toDataURL('image/png');
      }
    });
  }

  // 验证拼接图片的尺寸
  async function validateStitchedImage(stitchedDataUrl, metadata) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('=== 🖼️ 拼接图片尺寸验证 ===');
        console.log('页面信息:');
        console.log(`   - 实际页面高度: ${metadata.actualScrollHeight}px`);
        console.log(`   - 实际视口高度: ${metadata.actualViewportHeight}px`);
        console.log(`   - 可滚动内容: ${metadata.scrollableContent}px`);
        console.log('拼接图片信息:');
        console.log(`   - 拼接图片尺寸: ${img.width}x${img.height}px`);
        console.log(`   - 图片总数: ${metadata.totalSteps}`);
        console.log(`   - 滚动步长: ${metadata.scrollStep}px`);
        console.log('尺寸匹配检查:');
        console.log(`   - 高度匹配度: ${((img.height / metadata.actualScrollHeight) * 100).toFixed(1)}%`);
        
        const heightDiff = Math.abs(img.height - metadata.actualScrollHeight);
        const toleranceThreshold = metadata.actualScrollHeight * 0.2; // 提高容忍度到20%
        
        if (heightDiff > toleranceThreshold) {
          console.warn(`⚠️ 拼接图片高度差异较大: ${heightDiff}px (超过20%阈值: ${toleranceThreshold.toFixed(0)}px)`);
          showMessage(`拼接完成，图片高度与页面高度有 ${heightDiff}px 差异`, 'warning');
        } else {
          console.log(`✅ 拼接图片高度匹配良好 (差异: ${heightDiff}px, 在20%容忍范围内)`);
        }
        resolve();
      };
      img.onerror = () => {
        console.error('❌ 无法验证拼接图片尺寸');
        resolve();
      };
      img.src = stitchedDataUrl;
    });
  }

  // 应用圆角并更新预览
  async function updatePreview() {
    if (!originalDataUrl || isProcessing) return;
    
    const radius = parseInt(cornerRadiusInput.value) || 0;
    
    if (radius === 0) {
      screenshotPreview.src = originalDataUrl;
      return;
    }

    if (radius < 0 || radius > 50) {
      showMessage('圆角半径必须在0-50之间', 'error');
      cornerRadiusInput.value = Math.max(0, Math.min(50, radius));
      return;
    }

    isProcessing = true;
    
    try {
      const roundedImageUrl = await applyCornerRadius(originalDataUrl, radius);
      screenshotPreview.src = roundedImageUrl;
    } catch (error) {
      console.error('应用圆角时出错:', error);
      showMessage('应用圆角失败: ' + error.message, 'error');
      screenshotPreview.src = originalDataUrl;
    } finally {
      isProcessing = false;
    }
  }

  // 防抖处理，避免频繁处理
  let updateTimeout;
  cornerRadiusInput.addEventListener('input', () => {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updatePreview, 300);
  });

  saveBtn.addEventListener('click', async () => {
    if (!originalDataUrl) {
      showMessage('没有可保存的截图', 'error');
      return;
    }

    if (isProcessing) {
      showMessage('正在处理中，请稍候...', 'info');
      return;
    }

    setButtonLoading(saveBtn, true);

    try {
      const radius = parseInt(cornerRadiusInput.value) || 0;
      let finalImageUrl = originalDataUrl;
      
      if (radius > 0) {
        if (radius < 0 || radius > 50) {
          throw new Error('圆角半径必须在0-50之间');
        }
        finalImageUrl = await applyCornerRadius(originalDataUrl, radius);
      }

      // 创建下载链接
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `arcshot_${timestamp}.png`;
      link.href = finalImageUrl;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 显示成功消息
      showMessage('图片下载成功！', 'success');
      
      // 更新按钮文本
      saveBtn.textContent = '已保存！';
      setTimeout(() => {
        saveBtn.textContent = '保存并下载';
      }, 2000);
      
    } catch (error) {
      console.error('保存图像时出错:', error);
      showMessage('保存失败: ' + error.message, 'error');
    } finally {
      setButtonLoading(saveBtn, false, '保存并下载');
    }
  });

  // 键盘快捷键支持
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        saveBtn.click();
      }
    }
  });

  // 添加使用提示
  setTimeout(() => {
    if (originalDataUrl && !needsCropping) {
      showMessage('提示：使用 Ctrl+S (Mac: Cmd+S) 快速保存', 'info');
    }
  }, 2000);
});