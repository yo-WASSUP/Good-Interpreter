# 实时会议翻译器 | Meeting Translator

基于实时语音翻译 API 的中英双语会议翻译网页应用。

## ✨ 功能特点

- 🎤 **实时语音捕获** - 浏览器直接录音，支持选择麦克风设备
- 🔄 **双向翻译** - 中文↔英语自动翻译
- 📝 **双语字幕** - 实时显示原文和译文
- 🔊 **语音输出** - 播放翻译后的语音 (TTS)
- ✨ **精美界面** - 深色主题 + 玻璃拟态效果
- 🌐 **多语言支持** - 支持中、英、日、韩等语言

## � 两个版本

本项目支持两种 API 后端：

### 1. Gemini 版本（原版）
使用 Google Gemini Live API，适合国际用户。

### 2. 火山引擎版本（推荐国内用户）
使用火山引擎同声传译 API (AST)，延迟更低，更适合国内网络环境。

## �🚀 快速开始

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

编辑 `.env` 文件，根据你选择的版本填入对应的 API 凭据：

**Gemini 版本：**
```
GEMINI_API_KEY=your_gemini_api_key_here
```

**火山引擎版本：**
```
VOLC_APP_ID=your_app_id_here
VOLC_ACCESS_KEY=your_access_key_here
```

> 火山引擎 API 凭据获取：https://console.volcengine.com/

### 4. 启动服务器

**启动 Gemini 版本：**
```bash
npm start
```

**启动火山引擎版本：**
```bash
npm run start:volcengine
```

### 5. 打开浏览器

访问 [http://localhost:3000](http://localhost:3000)

## 📁 项目结构

```
web-app/
├── server.js                    # Gemini 版本服务器
├── server-volcengine.js         # 火山引擎版本服务器
├── package.json                 # 项目配置
├── .env.example                 # 环境变量模板
└── public/
    ├── index.html               # Gemini 版主页面
    ├── index-volcengine.html    # 火山引擎版主页面
    ├── styles.css               # 样式文件
    ├── app.js                   # Gemini 版前端逻辑
    └── app-volcengine.js        # 火山引擎版前端逻辑
```

## 🎯 使用说明

1. 选择 **麦克风设备**（可选）
2. 选择 **源语言** 和 **目标语言**
3. 点击 **开始翻译** 按钮
4. 允许浏览器获取麦克风权限
5. 开始说话，双语字幕实时显示
6. 翻译语音自动播放

## ⚠️ 注意事项

- 需要 Chrome/Edge 等现代浏览器（支持 MediaRecorder API）
- 需要有效的 API 凭据
- 需要稳定的网络连接
- 火山引擎版本需要在控制台开通语音翻译服务

## 🔧 API 说明

### 火山引擎同声传译 API

- **接口地址**: `wss://openspeech.bytedance.com/api/v4/ast/v2/translate`
- **认证方式**: HTTP 请求头 `X-Api-App-Key` 和 `X-Api-Access-Key`
- **音频格式**: PCM, 16kHz, 16bit, 单声道
- **支持语言**: 中文、英文、日语、韩语等

### Gemini Live API

- **模型**: `gemini-2.5-flash-native-audio-preview`
- **认证方式**: API Key
- **特点**: 原生音频支持，可自定义系统指令

## 📝 更新日志

### v1.1.0
- 新增火山引擎同声传译 API 支持
- 新增麦克风设备选择功能
- 新增语言选择器和交换按钮
- 优化界面布局和响应式设计

### v1.0.0
- 初始版本
- 使用 Gemini Live API
- 基础的中英互译功能
