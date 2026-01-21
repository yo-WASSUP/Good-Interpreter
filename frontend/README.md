# 会议同声传译 - React 前端

基于 React + TypeScript + Vite 的会议同声传译 Web 客户端。

## 📁 项目结构

```
frontend/
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── App.css              # 主样式（含背景动画）
│   ├── index.css            # 全局样式/CSS变量
│   ├── components/
│   │   ├── Header/          # 顶部栏
│   │   ├── Controls/        # 控制面板（录音、静音）
│   │   ├── SubtitleDisplay/ # 双列会议记录显示
│   │   ├── VolumeVisualizer/# 音量可视化
│   │   └── BackgroundEffects/# 背景特效
│   ├── hooks/
│   │   ├── useWebSocket.ts  # WebSocket 通信
│   │   ├── useAudioPlayer.ts# TTS 音频播放
│   │   └── useAudioRecorder.ts # 麦克风录音
│   ├── services/
│   │   └── api.ts           # REST API 调用
│   ├── types/
│   │   └── index.ts         # TypeScript 类型定义
│   └── utils/
│       └── audio.ts         # 音频工具函数
├── package.json
├── vite.config.ts
└── README.md
```

## 🚀 快速开始

### 安装依赖

```bash
cd frontend
npm install
```

### 开发模式

```bash
npm run dev
# 访问 http://localhost:5173
```

### 生产构建

```bash
npm run build
# 构建产物在 dist/ 目录
```

## ✨ 功能特性

- **双向翻译**：🇨🇳 中文 ↔ 英文 🇺🇸 实时互译
- **双列显示**：左列中译英、右列英译中
- **TTS 朗读**：翻译结果自动语音播报
- **静音控制**：一键静音/取消静音
- **AI 总结**：基于 OpenAI 的会议智能总结
- **导出功能**：导出会议记录和总结
- **音量可视化**：实时显示麦克风输入音量

## 🎨 技术栈

| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Framer Motion | 动画效果 |
| Lucide React | 图标库 |
| react-markdown | Markdown 渲染 |

## 📡 与后端通信

前端通过 WebSocket 与后端实时通信：
- 发送 PCM 音频数据（base64 编码）
- 接收 ASR、翻译结果和 TTS 音频

生产模式下，前端静态文件由后端托管，访问 `http://localhost:3000` 即可。
