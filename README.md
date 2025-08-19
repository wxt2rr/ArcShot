# ArcShot 📸

[![许可: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![版本](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-username/arcshot)
[![构建状态](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/your-username/arcshot)

一款为 Chrome 打造的增强型截图工具，为效率和美观而生。在数秒内将任何网页转化为精美图片。

> **特别说明:** 本项目的初始架构由 AI 代码助手 **通义千问 Qwen3-Coder** 高效规划与构建。仓库中包含了完整的技术文档与实现方案。

![ArcShot 功能演示](https://github.com/wxt2rr/ArcShot/images/home.png)
![ArcShot 功能演示](https://github.com/wxt2rr/ArcShot/images/result.png)
*（v1.0 版本发布后将更新演示图）*

## 🚀 关于项目

是否曾对浏览器笨拙、功能有限的截图能力感到厌倦？是否曾为了截取长网页或添加简单的圆角而不得不切换使用多个工具？

**ArcShot** 正是为了解决这一效率瓶颈而生。

它是一款轻量而强大的 Chrome 扩展程序，为您提供一站式的网页捕捉、美化和保存解决方案，带来流畅无缝的截图体验。

## ✨ 主要功能

* 🖼️ **多样化的捕捉模式**:
    * **全屏截图**: 捕捉标签页的完整可见区域。
    * **选区截图**: 通过拖拽精准选择任意区域。
    * **滚动长图**: 自动滚动并无缝拼接长页面，生成一张完美的图片。

* 🎨 **即时图像美化**:
    * **圆角处理**: 在预览窗口中直接调整圆角大小，创造更现代化、更美观的视觉效果。

* ⚙️ **简洁高效的工作流**:
    * **即时预览**: 截图后立即在结果页查看预览。
    * **PNG 格式导出**: 一键将您处理好的图片以高质量 PNG 格式下载。
    * **直观的用户界面**: 界面简洁清晰，无需任何学习成本。

## 🛠️ 技术栈

本项目基于现代 Web 技术与 Chrome 扩展 API 构建：

* **前端**: HTML5, CSS3, JavaScript
* **核心 API**:
    * Chrome 扩展 API (`chrome.tabs`, `chrome.scripting`, `chrome.downloads`)
    * HTML5 Canvas API (用于图像处理，如拼接、圆角等)

## 📦 安装与使用

请根据以下步骤在本地安装并运行。

1.  **克隆本仓库:**
    ```sh
    git clone [https://github.com/your-username/arcshot.git](https://github.com/your-username/arcshot.git)
    ```
2.  **在 Chrome 中加载扩展:**
    * 打开 Google Chrome 浏览器，访问 `chrome://extensions`。
    * 在页面右上角，打开 **“开发者模式”** 的开关。
    * 点击 **“加载已解压的扩展程序”** 按钮。
    * 在弹出的窗口中，选择您刚刚克隆到本地的 `arcshot` 文件夹。
3.  **完成！** 您现在应该可以在浏览器的工具栏中看到 ArcShot 的图标了。

## 📖 使用方法

1.  在 Chrome 工具栏中点击 ArcShot 图标。
2.  在弹出的菜单中选择您需要的截图模式（如全屏、选区）。
3.  如果选择滚动截图，扩展程序将自动完成。
4.  截图完成后，页面将跳转至结果页，您可以在此预览图片。
5.  通过调整 **“圆角”** 输入框的数值来美化您的图片。
6.  点击 **“保存并下载”** 按钮，将最终的 PNG 图片保存到您的电脑。

## 🗺️ 路线图

ArcShot 是一个持续演进的项目，未来计划增加以下功能：

* [ ] 图片标注工具（箭头、文字、矩形等）
* [ ] 更多导出格式（如 JPG）
* [ ] 云存储集成（如保存到 Google Drive/Dropbox）
* [ ] 自定义水印功能

欢迎访问 [项目 Issues](https://github.com/your-username/arcshot/issues) 查看更详细的功能建议和已知问题。

## 💡 特别鸣谢：AI 加速开发

特别感谢 **通义千问 Qwen3-Coder**。本项目的完整技术文档、软件架构和核心实现逻辑，均在其深度参与和协助下完成。它如同一位“AI 架构师”，将数天的规划阶段大幅缩短至数小时，并为滚动拼接、Canvas 图像处理等复杂功能提供了稳定可靠的解决方案。

## 🤝 贡献指南

开源社区的魅力在于共同创造。我们非常欢迎并感谢您的任何贡献。

如果您有任何好的建议，请 Fork 本仓库并创建一个 Pull Request。您也可以直接提交一个带有 "enhancement" 标签的 Issue。

1.  Fork 本项目
2.  创建您的功能分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  将分支推送到远程仓库 (`git push origin feature/AmazingFeature`)
5.  创建一个 Pull Request

## 📄 开源许可

本项目基于 MIT 许可协议。详情请参阅 `LICENSE` 文件。

## 📧 联系方式

你的名字 - [@你的社交账号](https://twitter.com/yourtwitter) - email@example.com

项目链接: [https://github.com/your-username/arcshot](https://github.com/your-username/arcshot)
