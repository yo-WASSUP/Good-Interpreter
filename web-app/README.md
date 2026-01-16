# 实时会议翻译器 | Meeting Translator

基于 Google Gemini Live API 的实时中英双语会议翻译网页应用。

## ✨ 功能特点

- 🎤 **实时语音捕获** - 浏览器直接录音
- 🔄 **双向翻译** - 中文↔英语自动识别
- 📝 **双语字幕** - 实时显示原文和译文
- 🔊 **语音输出** - 播放翻译后的语音
- ✨ **精美界面** - 深色主题 + 玻璃拟态效果

## 🚀 快速开始

### 1. 安装 Node.js

如果尚未安装 Node.js，请前往 [Node.js 官网](https://nodejs.org/) 下载安装（推荐 v18+）。

### 2. 安装依赖

```bash
cd web-app
npm install
```

### 3. 配置 API Key

复制环境变量模板文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 Gemini API Key：

```
GEMINI_API_KEY=your_actual_api_key_here
```

### 4. 启动服务器

```bash
npm start
```

### 5. 打开浏览器

访问 [http://localhost:3000](http://localhost:3000)

## 📁 项目结构

```
web-app/
├── server.js           # Node.js 服务器 + WebSocket + Gemini API
├── package.json        # 项目配置
└── public/
    ├── index.html      # 主页面
    ├── styles.css      # 样式文件
    └── app.js          # 前端逻辑
```

## 🎯 使用说明

1. 点击 **开始翻译** 按钮
2. 允许浏览器获取麦克风权限
3. 说中文 → 自动翻译成英文
4. 说英文 → 自动翻译成中文
5. 双语字幕实时显示，翻译语音自动播放

## ⚠️ 注意事项

- 需要 Chrome/Edge 等现代浏览器（支持 MediaRecorder API）
- 需要有效的 Gemini API Key
- 需要稳定的网络连接
