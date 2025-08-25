/**
 * 手动框选+滚动截图的智能实现示例
 * 展示如何使用SmartScrollCalculator优化滚动逻辑
 */

// 模拟的使用场景
function demonstrateSmartScrolling() {
  console.log('🎯 === 智能滚动系统演示 ===');
  
  // 模拟用户选择的区域（文档坐标）
  const userSelection = {
    x: 100,
    y: 800,    // 用户选择的起始位置
    width: 600,
    height: 1200  // 选择区域跨越1200px高度
  };
  
  // 模拟页面信息
  const pageInfo = {
    scrollHeight: 3000,     // 页面总高度
    viewportHeight: 800,    // 视口高度
    maxScrollTop: 2200,     // 最大滚动距离
    currentScrollTop: 0     // 当前滚动位置
  };
  
  // 创建智能滚动计划
  const calculator = new SmartScrollCalculator();
  const plan = calculator.createScrollPlan(userSelection, pageInfo);
  
  // 输出计划详情
  calculator.debugPlan(plan);
  
  // 对比传统方法和智能方法
  console.log('\n📊 === 效率对比 ===');
  
  // 传统方法：全页面滚动
  const traditionalSteps = Math.ceil(pageInfo.maxScrollTop / (pageInfo.viewportHeight * 0.85)) + 1;
  const traditionalTime = traditionalSteps * 2500; // 假设每步2.5秒
  
  console.log(`传统方法: ${traditionalSteps}步, 耗时${Math.ceil(traditionalTime/1000)}秒`);
  console.log(`智能方法: ${plan.metadata.totalSteps}步, 耗时${plan.performance.estimatedTimeFormatted}`);
  console.log(`效率提升: ${plan.metadata.efficiencyGain}`);
  
  return plan;
}

// 实际集成到ArcShot的示例代码
function integrateWithArcShot() {
  console.log('\n🔧 === ArcShot集成示例 ===');
  
  /**
   * 在background.js中的handleAreaSelection函数中使用
   */
  async function optimizedAreaSelection(selection, tabId, isScrollingMode) {
    if (!isScrollingMode) {
      // 普通模式保持原有逻辑
      return handleNormalAreaSelection(selection, tabId);
    }
    
    console.log('🧠 启用智能滚动模式...');
    
    // 1. 获取页面信息
    const pageInfo = await getPageInfo(tabId);
    
    // 2. 创建智能滚动计划
    const calculator = new SmartScrollCalculator();
    const plan = calculator.createScrollPlan(selection, pageInfo);
    
    if (plan.fallbackToSimple) {
      console.log('📝 选择区域无需滚动，切换到简单模式');
      return handleNormalAreaSelection(selection, tabId);
    }
    
    // 3. 显示用户友好的进度预估
    showUserProgress({
      totalSteps: plan.metadata.totalSteps,
      estimatedTime: plan.performance.estimatedTimeFormatted,
      qualityLevel: plan.strategy.name,
      recommendations: plan.performance.recommendations
    });
    
    // 4. 执行优化的滚动截图
    const screenshots = await executeOptimizedScrolling(tabId, plan);
    
    // 5. 智能拼接和裁剪
    const finalImage = await processOptimizedImages(screenshots, plan, selection);
    
    return finalImage;
  }
  
  /**
   * 执行优化的滚动截图
   */
  async function executeOptimizedScrolling(tabId, plan) {
    const screenshots = [];
    const { positions } = plan;
    
    console.log(`🎬 开始执行${positions.length}步优化滚动截图...`);
    
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      
      console.log(`📸 第${i + 1}/${positions.length}步 (${position.progress}%)`);
      console.log(`   滚动到: ${position.y}px${position.isEdge ? ' [边界保护]' : ''}`);
      
      try {
        // 滚动到指定位置
        await scrollToPosition(tabId, position.y);
        
        // 边界位置需要更长的等待时间
        const waitTime = position.isEdge ? 1200 : 800;
        await wait(waitTime);
        
        // 截图
        const screenshot = await captureWithRetry(tabId, i + 1);
        screenshots.push({
          data: screenshot,
          position: position,
          timestamp: Date.now()
        });
        
        // 动态调整截图间隔
        const interval = calculateDynamicInterval(i, positions.length, plan.strategy);
        if (i < positions.length - 1) {
          await wait(interval);
        }
        
      } catch (error) {
        console.error(`❌ 第${i + 1}步失败:`, error);
        
        // 智能错误恢复
        if (position.isEdge) {
          // 边界步骤失败，尝试备用策略
          console.log('🔄 边界步骤失败，尝试备用策略...');
          const fallbackScreenshot = await retryWithFallback(tabId, position);
          if (fallbackScreenshot) {
            screenshots.push({
              data: fallbackScreenshot,
              position: position,
              timestamp: Date.now(),
              isFallback: true
            });
          }
        } else if (screenshots.length === 0) {
          // 初始步骤就失败，直接抛出错误
          throw new Error(`滚动截图在第${i + 1}步失败，无法继续`);
        }
        // 中间步骤失败，继续但记录警告
        console.warn(`⚠️ 跳过失败的第${i + 1}步，继续处理...`);
      }
    }
    
    console.log(`✅ 优化滚动截图完成，成功${screenshots.length}/${positions.length}步`);
    return screenshots;
  }
  
  /**
   * 动态计算截图间隔
   */
  function calculateDynamicInterval(currentStep, totalSteps, strategy) {
    // 基于策略和步骤位置动态调整
    const baseInterval = {
      efficient: 1500,
      balanced: 2000,
      precise: 2500
    }[strategy.name];
    
    // 前几步和后几步需要更长间隔
    const isEarlyStep = currentStep < 2;
    const isLateStep = currentStep > totalSteps - 3;
    
    if (isEarlyStep || isLateStep) {
      return baseInterval + 1000;
    }
    
    return baseInterval;
  }
  
  /**
   * 用户进度显示
   */
  function showUserProgress(progressInfo) {
    console.log('📊 === 智能截图计划 ===');
    console.log(`总步数: ${progressInfo.totalSteps}`);
    console.log(`预计耗时: ${progressInfo.estimatedTime}`);
    console.log(`质量等级: ${progressInfo.qualityLevel}`);
    
    if (progressInfo.recommendations.length > 0) {
      console.log('💡 建议:');
      progressInfo.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
  }
  
  // 辅助函数
  async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async function scrollToPosition(tabId, y) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y }, resolve);
    });
  }
  
  async function captureWithRetry(tabId, stepNumber) {
    // 使用现有的captureWithRetry逻辑
    return 'mock_screenshot_data';
  }
  
  async function retryWithFallback(tabId, position) {
    // 实现备用截图策略
    return 'fallback_screenshot_data';
  }
  
  async function processOptimizedImages(screenshots, plan, selection) {
    // 实现智能拼接和裁剪逻辑
    return 'final_processed_image';
  }
  
  async function getPageInfo(tabId) {
    // 获取页面信息的现有逻辑
    return {
      scrollHeight: 3000,
      viewportHeight: 800,
      maxScrollTop: 2200
    };
  }
  
  async function handleNormalAreaSelection(selection, tabId) {
    // 现有的普通区域选择逻辑
    return 'normal_selection_result';
  }
}

// 运行演示
if (typeof window !== 'undefined') {
  // 浏览器环境
  console.log('🌐 浏览器环境，运行演示...');
  demonstrateSmartScrolling();
  integrateWithArcShot();
} else {
  // Node.js环境
  console.log('🖥️ Node.js环境');
  module.exports = { demonstrateSmartScrolling, integrateWithArcShot };
}