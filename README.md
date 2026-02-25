# 🎙️ Good-Interpreter — 会议同声传译

<p align="center">
  <b>基于火山引擎 AST 2.0 的实时双向同声传译系统</b><br/>
  🇨🇳 中文 ↔ 英文 🇺🇸 | 实时语音识别 · 同声翻译 · TTS 朗读 · AI 会议总结
</p>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🎤 **实时语音识别** | 基于火山引擎 AST 2.0，毫秒级延迟 |
| 🔄 **双向同声传译** | 中文 ↔ 英文实时互译 |
| 🔊 **TTS 语音播报** | 翻译结果自动朗读，支持静音控制 |
| 📝 **双列字幕显示** | 左列中→英，右列英→中，清晰分离 |
| 🤖 **AI 会议总结** | 基于 OpenAI 的智能会议摘要 |
| 📤 **导出会议记录** | 支持导出文本和 Markdown 格式 |
| 🌗 **亮/暗色主题** | 一键切换|
| 🎨 **现代 UI** | 毛玻璃特效 + 动画 + 音量可视化 |

## 🏗️ 项目结构

```
Good-Interpreter/
├── backend/              # Python 后端 (aiohttp)
│   ├── app/
│   │   ├── main.py       # 应用入口
│   │   ├── config.py     # 配置管理
│   │   ├── database.py   # SQLite 数据库
│   │   ├── routes/       # API & WebSocket 路由
│   │   └── services/     # 火山引擎 & OpenAI 服务
│   ├── requirements.txt
│   └── README.md
├── frontend/             # React 前端 (Vite + TypeScript)
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   ├── hooks/        # WebSocket / 录音 / 播放
│   │   ├── services/     # REST API 调用
│   │   └── utils/        # 工具函数
│   ├── package.json
│   └── README.md
└── README.md             # 本文件
```

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 20.19
- **Python** ≥ 3.9
- [火山引擎同声传译](https://www.volcengine.com/product/ast) App ID & Access Key
- (可选) OpenAI API Key — 用于 AI 会议总结

### 1. 克隆项目

```bash
git clone https://github.com/yo-WASSUP/Good-Interpreter.git
cd Good-Interpreter
```

### 2. 配置环境变量

在 `backend/` 目录下创建 `.env` 文件：

```env
# 火山引擎 AST API（必须）
VOLC_APP_ID=your_app_id
VOLC_ACCESS_KEY=your_access_key

# OpenAI API（AI 总结功能，可选）
OPENAI_API_KEY=sk-your_api_key

# 服务端口
PORT=3100
```

### 3. 启动后端

```bash
cd backend
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
.\venv\Scripts\Activate

pip install -r requirements.txt
python -m app.main
```

后端服务将启动在 `http://localhost:3100`

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`

### 生产部署

```bash
cd frontend
npm run build
# 构建产物在 frontend/dist/，由后端自动托管
# 只需运行后端即可，访问 http://localhost:3100
```

## 🎨 界面预览

应用提供精美的暗色/亮色双主题界面：

- **暗色模式**：深色背景 + 毛玻璃卡片 + 渐变光晕动画
- **亮色模式**：柔和浅灰背景 + 清爽配色

点击右上角 ☀️/🌙 按钮即可切换。

## 🔧 技术栈

### 后端
| 技术 | 用途 |
|------|------|
| aiohttp | 异步 Web 框架 |
| 火山引擎 AST 2.0 | 语音识别/翻译/合成 |
| OpenAI API | 会议智能总结 |
| SQLite | 会话历史存储 |

### 前端
| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Framer Motion | 动画效果 |
| Lucide React | 图标库 |
| react-markdown | Markdown 渲染 |

## 📡 通信架构

```
浏览器 ←WebSocket→ Python 后端 ←WebSocket→ 火山引擎 AST API
  │                    │
  │ REST API           │ SQLite
  │ (会议总结/历史)     │ (会话存储)
```

1. 浏览器采集麦克风音频，通过 WebSocket 发送 PCM 数据到后端
2. 后端转发至火山引擎进行 ASR + 翻译 + TTS
3. 识别结果、翻译文本、TTS 音频实时回传浏览器
4. 前端渲染双列字幕并播放合成语音

## 📄 License

MIT

## 🙏 致谢

- [火山引擎 AST 同声传译](https://www.volcengine.com/product/ast)
