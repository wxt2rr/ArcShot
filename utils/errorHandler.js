/**
 * ArcShot 统一错误处理系统
 * 用于简化和标准化错误处理流程
 */
class ErrorHandler {
  /**
   * 处理Chrome API相关错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   * @param {Function} fallback - 可选的备用方案
   */
  static async handleChromeAPIError(error, context, fallback = null) {
    const errorMessage = chrome.runtime.lastError?.message || error?.message || '未知错误';
    
    console.error(`❌ Chrome API错误 [${context}]:`, errorMessage);
    
    // 常见错误分类处理
    if (errorMessage.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
      console.log('⏱️ 截图频率限制，建议等待3秒后重试');
      return { type: 'rate_limit', delay: 3000, message: errorMessage };
    }
    
    if (errorMessage.includes('not in effect') || errorMessage.includes('permission')) {
      console.log('🔒 权限问题，建议检查扩展权限设置');
      return { type: 'permission', message: errorMessage };
    }
    
    if (errorMessage.includes('No window with id')) {
      console.log('🪟 窗口ID错误，使用当前窗口作为备用');
      return { type: 'window_id', message: errorMessage };
    }
    
    if (errorMessage.includes('Could not establish connection')) {
      console.log('📡 通信失败，可能需要重新注入content script');
      return { type: 'connection', message: errorMessage };
    }
    
    // 执行备用方案
    if (fallback && typeof fallback === 'function') {
      try {
        console.log(`🔄 执行备用方案...`);
        return await fallback();
      } catch (fallbackError) {
        console.error('❌ 备用方案也失败:', fallbackError);
      }
    }
    
    return { type: 'unknown', message: errorMessage };
  }
  
  /**
   * 带重试机制的异步操作封装
   * @param {Function} asyncFn - 异步函数
   * @param {number} maxRetries - 最大重试次数
   * @param {number} baseDelay - 基础延迟时间（毫秒）
   * @param {string} context - 操作上下文
   */
  static async withRetry(asyncFn, maxRetries = 3, baseDelay = 1000, context = '操作') {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`🔄 ${context} - 第${attempt + 1}次尝试`);
        const result = await asyncFn();
        console.log(`✅ ${context} - 成功完成`);
        return result;
      } catch (error) {
        console.error(`❌ ${context} - 第${attempt + 1}次失败:`, error);
        
        if (attempt === maxRetries - 1) {
          console.error(`💥 ${context} - 达到最大重试次数，操作失败`);
          throw error;
        }
        
        // 计算延迟时间（指数退避）
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⏱️ ${context} - 等待${delay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  /**
   * 安全的消息发送（带重试）
   * @param {number} tabId - 标签页ID
   * @param {Object} message - 消息内容
   * @param {number} maxRetries - 最大重试次数
   */
  static async sendMessageSafely(tabId, message, maxRetries = 3) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    }, maxRetries, 1000, `发送消息到标签页${tabId}`);
  }
  
  /**
   * 安全的截图操作（带重试）
   * @param {number|null} windowId - 窗口ID，null表示当前窗口
   * @param {Object} options - 截图选项
   * @param {number} maxRetries - 最大重试次数
   */
  static async captureScreenshotSafely(windowId = null, options = { format: 'png' }, maxRetries = 3) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!dataUrl) {
            reject(new Error('截图数据为空'));
          } else {
            resolve(dataUrl);
          }
        });
      });
    }, maxRetries, 1000, `截图操作(窗口${windowId || '当前'})`);
  }
  
  /**
   * 内存使用监控
   */
  static logMemoryUsage(context = '') {
    if (performance && performance.memory) {
      const memory = performance.memory;
      console.log(`📊 内存使用情况 [${context}]:`, {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
      });
    }
  }
  
  /**
   * 清理存储数据（防止配额超限）
   */
  static async cleanupStorageData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (allData) => {
        const keysToRemove = [];
        const currentTime = Date.now();
        const oneHourAgo = currentTime - 60 * 60 * 1000; // 1小时前
        
        // 清理旧的截图数据
        for (const [key, value] of Object.entries(allData)) {
          if (key.includes('screenshot') || key.includes('stitch')) {
            if (value.timestamp && value.timestamp < oneHourAgo) {
              keysToRemove.push(key);
            }
          }
        }
        
        if (keysToRemove.length > 0) {
          console.log(`🧹 清理${keysToRemove.length}个过期数据项:`, keysToRemove);
          chrome.storage.local.remove(keysToRemove, () => {
            console.log('✅ 存储清理完成');
            resolve();
          });
        } else {
          console.log('✅ 无需清理存储数据');
          resolve();
        }
      });
    });
  }
}

// 导出错误处理类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
} else if (typeof window !== 'undefined') {
  window.ErrorHandler = ErrorHandler;
} 