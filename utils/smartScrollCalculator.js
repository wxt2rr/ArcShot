/**
 * ArcShot 智能滚动步长计算器
 * 专为手动框选+滚动截图优化的高级算法
 * 
 * 设计原则：
 * 1. 效率优先：只滚动必要的范围
 * 2. 精度保证：根据内容特性调整重叠
 * 3. 用户体验：提供准确的进度预估
 */

class SmartScrollCalculator {
  constructor() {
    this.defaultConfig = {
      // 缓冲区比例：选择区域外的额外截图范围
      bufferRatio: 0.1,
      
      // 步长策略配置
      stepStrategies: {
        efficient: { stepRatio: 0.9, overlapRatio: 0.1 },   // 小区域高效模式
        balanced: { stepRatio: 0.85, overlapRatio: 0.15 },  // 中等区域平衡模式
        precise: { stepRatio: 0.8, overlapRatio: 0.2 }      // 大区域精确模式
      },
      
      // 边界保护：边界区域使用更小步长
      edgeStepReduction: 0.7,
      
      // 最小滚动阈值
      minScrollThreshold: 50
    };
  }

  /**
   * 计算最优滚动范围
   * @param {Object} selection - 用户选择的区域 {x, y, width, height}
   * @param {Object} pageInfo - 页面信息 {scrollHeight, viewportHeight, maxScrollTop}
   * @returns {Object} 滚动范围信息
   */
  calculateScrollRange(selection, pageInfo) {
    const { y: selectionTop, height: selectionHeight } = selection;
    const { viewportHeight, maxScrollTop } = pageInfo;
    const { bufferRatio, minScrollThreshold } = this.defaultConfig;
    
    // 计算缓冲区大小
    const bufferSize = Math.floor(viewportHeight * bufferRatio);
    
    // 计算实际滚动范围
    const startScrollY = Math.max(0, selectionTop - bufferSize);
    const endScrollY = Math.min(maxScrollTop, selectionTop + selectionHeight + bufferSize);
    const effectiveRange = endScrollY - startScrollY;
    
    // 判断是否需要滚动
    const needsScrolling = effectiveRange > minScrollThreshold;
    
    return {
      startScrollY,
      endScrollY,
      effectiveRange,
      needsScrolling,
      bufferSize,
      optimization: {
        originalRange: maxScrollTop,
        optimizedRange: effectiveRange,
        efficiencyGain: ((maxScrollTop - effectiveRange) / maxScrollTop * 100).toFixed(1) + '%'
      }
    };
  }

  /**
   * 选择最佳滚动策略
   * @param {Object} selection - 选择区域
   * @param {number} viewportHeight - 视口高度
   * @param {boolean} useSelectionHeight - 是否基于选择区域高度计算步长
   * @returns {Object} 策略配置
   */
  selectScrollStrategy(selection, viewportHeight, useSelectionHeight = false) {
    const selectionHeight = selection.height;
    const baseHeight = useSelectionHeight ? selectionHeight : viewportHeight;
    const viewportRatio = selectionHeight / viewportHeight;
    const { stepStrategies } = this.defaultConfig;
    
    let strategy;
    let strategyName;
    
    if (viewportRatio < 0.5) {
      strategy = stepStrategies.efficient;
      strategyName = 'efficient';
    } else if (viewportRatio < 2) {
      strategy = stepStrategies.balanced;
      strategyName = 'balanced';
    } else {
      strategy = stepStrategies.precise;
      strategyName = 'precise';
    }
    
    return {
      name: strategyName,
      stepRatio: strategy.stepRatio,
      overlapRatio: strategy.overlapRatio,
      scrollStep: Math.floor(baseHeight * strategy.stepRatio),
      overlap: Math.floor(baseHeight * strategy.overlapRatio),
      baseHeight,
      useSelectionHeight,
      reasoning: useSelectionHeight ? 
        `基于选择区域高度${selectionHeight}px，视口比例${viewportRatio.toFixed(2)}，采用${strategyName}策略` :
        `选择区域高度${selectionHeight}px，视口比例${viewportRatio.toFixed(2)}，采用${strategyName}策略`
    };
  }

  /**
   * 生成优化的滚动位置序列
   * @param {Object} scrollRange - 滚动范围
   * @param {Object} strategy - 滚动策略
   * @returns {Array} 滚动位置数组
   */
  generateScrollPositions(scrollRange, strategy) {
    const { startScrollY, endScrollY, effectiveRange } = scrollRange;
    const { scrollStep, overlap } = strategy;
    const { edgeStepReduction } = this.defaultConfig;
    
    const positions = [];
    let currentY = startScrollY;
    let stepIndex = 0;
    
    while (currentY < endScrollY) {
      const isFirstStep = stepIndex === 0;
      const isLastStep = currentY + scrollStep >= endScrollY;
      const isEdgeStep = isFirstStep || isLastStep;
      
      // 边界步骤使用更小步长确保完整性
      const actualStep = isEdgeStep ? 
        Math.floor(scrollStep * edgeStepReduction) : 
        scrollStep;
      
      positions.push({
        y: currentY,
        index: stepIndex,
        step: actualStep,
        isEdge: isEdgeStep,
        progress: ((currentY - startScrollY) / effectiveRange * 100).toFixed(1),
        metadata: {
          isFirst: isFirstStep,
          isLast: isLastStep,
          expectedOverlap: isEdgeStep ? Math.floor(overlap * 1.5) : overlap
        }
      });
      
      currentY += actualStep;
      stepIndex++;
    }
    
    return positions;
  }

  /**
   * 计算完整的滚动截图计划
   * @param {Object} selection - 用户选择区域
   * @param {Object} pageInfo - 页面信息
   * @param {Object} options - 选项配置
   * @param {boolean} options.useSelectionHeight - 是否基于选择区域高度计算步长
   * @param {boolean} options.needsWidthCropping - 是否需要宽度裁剪
   * @returns {Object} 完整的截图计划
   */
  createScrollPlan(selection, pageInfo, options = {}) {
    const { useSelectionHeight = false, needsWidthCropping = false } = options;
    
    console.log('🧠 === 智能滚动计划生成 ===');
    console.log('选择区域:', selection);
    console.log('页面信息:', pageInfo);
    console.log('优化选项:', { useSelectionHeight, needsWidthCropping });
    
    // 1. 计算滚动范围
    const scrollRange = this.calculateScrollRange(selection, pageInfo);
    console.log('📏 滚动范围优化:', scrollRange.optimization);
    
    if (!scrollRange.needsScrolling) {
      return {
        type: 'simple',
        reason: '选择区域无需滚动，使用简单截图',
        fallbackToSimple: true
      };
    }
    
    // 2. 选择滚动策略（支持基于选择区域的步长）
    const strategy = this.selectScrollStrategy(selection, pageInfo.viewportHeight, useSelectionHeight);
    console.log('🎯 策略选择:', strategy.reasoning);
    
    // 3. 生成滚动位置
    const positions = this.generateScrollPositions(scrollRange, strategy);
    console.log(`📋 生成${positions.length}个滚动位置`);
    
    // 4. 计算性能预估
    const performance = this.estimatePerformance(positions, strategy);
    
    return {
      type: 'scrolling',
      scrollRange,
      strategy,
      positions,
      performance,
      options,
      metadata: {
        totalSteps: positions.length,
        estimatedTime: performance.estimatedTime,
        efficiencyGain: scrollRange.optimization.efficiencyGain,
        qualityLevel: strategy.name,
        useSelectionHeight,
        needsWidthCropping
      }
    };
  }

  /**
   * 估算性能指标
   * @param {Array} positions - 滚动位置数组
   * @param {Object} strategy - 滚动策略
   * @returns {Object} 性能估算结果
   */
  estimatePerformance(positions, strategy) {
    const avgCaptureTime = 1500; // 平均每次截图时间（ms）
    const avgScrollTime = 800;   // 平均滚动时间（ms）
    const avgProcessTime = 200;  // 平均处理时间（ms）
    
    const totalSteps = positions.length;
    const estimatedTime = totalSteps * (avgCaptureTime + avgScrollTime + avgProcessTime);
    
    return {
      totalSteps,
      estimatedTime,
      estimatedTimeFormatted: this.formatTime(estimatedTime),
      qualityScore: this.calculateQualityScore(strategy),
      memoryUsage: this.estimateMemoryUsage(totalSteps),
      recommendations: this.generateRecommendations(totalSteps, strategy)
    };
  }

  /**
   * 计算质量评分
   * @param {Object} strategy - 滚动策略
   * @returns {number} 质量评分 (1-10)
   */
  calculateQualityScore(strategy) {
    const qualityScores = {
      efficient: 7,  // 高效但可能丢失细节
      balanced: 9,   // 平衡性最佳
      precise: 10    // 最高精度
    };
    
    return qualityScores[strategy.name] || 8;
  }

  /**
   * 估算内存使用
   * @param {number} totalSteps - 总步数
   * @returns {string} 内存使用估算
   */
  estimateMemoryUsage(totalSteps) {
    const avgImageSize = 2; // 平均每张图片2MB
    const totalMemory = totalSteps * avgImageSize;
    
    if (totalMemory > 100) {
      return { level: 'high', value: totalMemory, warning: '内存使用较高，建议关闭其他应用' };
    } else if (totalMemory > 50) {
      return { level: 'medium', value: totalMemory, warning: '内存使用中等' };
    } else {
      return { level: 'low', value: totalMemory, warning: '内存使用较低' };
    }
  }

  /**
   * 生成优化建议
   * @param {number} totalSteps - 总步数
   * @param {Object} strategy - 策略
   * @returns {Array} 建议列表
   */
  generateRecommendations(totalSteps, strategy) {
    const recommendations = [];
    
    if (totalSteps > 20) {
      recommendations.push('步数较多，建议在稳定网络环境下进行');
    }
    
    if (strategy.name === 'precise') {
      recommendations.push('已启用高精度模式，截图质量最佳但耗时较长');
    }
    
    if (totalSteps > 10) {
      recommendations.push('建议保持页面稳定，避免在截图过程中滚动或点击');
    }
    
    return recommendations;
  }

  /**
   * 格式化时间显示
   * @param {number} ms - 毫秒
   * @returns {string} 格式化的时间
   */
  formatTime(ms) {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) {
      return `约${seconds}秒`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `约${minutes}分${remainingSeconds}秒`;
    }
  }

  /**
   * 调试方法：输出详细的计划信息
   * @param {Object} plan - 滚动计划
   */
  debugPlan(plan) {
    console.log('🔬 === 滚动计划详细信息 ===');
    console.table(plan.positions.map(pos => ({
      步骤: pos.index + 1,
      滚动位置: `${pos.y}px`,
      步长: `${pos.step}px`,
      进度: `${pos.progress}%`,
      边界: pos.isEdge ? '是' : '否'
    })));
    
    console.log('📊 性能预估:', plan.performance);
    console.log('💡 优化建议:', plan.performance.recommendations);
  }
}

// 创建全局实例
const smartScrollCalculator = new SmartScrollCalculator();

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartScrollCalculator;
} else {
  window.SmartScrollCalculator = SmartScrollCalculator;
  window.smartScrollCalculator = smartScrollCalculator;
}