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
  chrome.storage.local.get(['screenshotDataUrl', 'selectionArea', 'needsCropping'], async (result) => {
    if (chrome.runtime.lastError) {
      showMessage('获取截图数据失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    
    if (result.screenshotDataUrl) {
      originalDataUrl = result.screenshotDataUrl;
      needsCropping = result.needsCropping || false;
      selectionArea = result.selectionArea || null;
      
      if (needsCropping && selectionArea) {
        // 需要裁剪，显示提示
        showMessage('正在处理手动选择的区域...', 'info');
        
        try {
          // 裁剪图像
          const croppedDataUrl = await cropImage(originalDataUrl, selectionArea);
          originalDataUrl = croppedDataUrl;
          
          // 清除裁剪标志
          chrome.storage.local.remove(['selectionArea', 'needsCropping']);
          
          showMessage('区域裁剪完成！', 'success');
        } catch (error) {
          console.error('裁剪失败:', error);
          showMessage('裁剪失败: ' + error.message, 'error');
        }
      }
      
      screenshotPreview.src = originalDataUrl;
      screenshotPreview.onload = () => {
        if (!needsCropping) {
          showMessage('截图加载完成，可以调整圆角效果', 'success');
        }
      };
      screenshotPreview.onerror = () => {
        showMessage('截图加载失败', 'error');
      };
    } else {
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
    }
  });

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