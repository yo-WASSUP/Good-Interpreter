# Python Backend for Real-time Translator

火山引擎同声传译 Python 后端服务，基于官方 AST 2.0 API。

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py           # 应用入口
│   ├── config.py         # 配置管理
│   ├── routes/
│   │   ├── __init__.py
│   │   └── websocket.py  # WebSocket 路由
│   ├── services/
│   │   ├── __init__.py
│   │   └── volcengine.py # 火山引擎服务
│   └── utils/
│       ├── __init__.py
│       └── protobuf.py   # Protobuf 工具
├── requirements.txt
├── .env.example
└── README.md
```

## 安装

```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

## 配置

复制 `.env.example` 为 `.env` 并填写：

```env
VOLC_APP_ID=your_app_id
VOLC_ACCESS_KEY=your_access_key
PORT=3000
```

## 运行

```bash
source venv/bin/activate
python -m app.main
```

## API

### WebSocket `/ws`

连接后发送消息：

**开始翻译：**
```json
{
  "type": "start",
  "sourceLanguage": "zh",
  "targetLanguage": "en"
}
```

**发送音频：**
```json
{
  "type": "audio",
  "data": "<base64_pcm_audio>"
}
```

**停止翻译：**
```json
{
  "type": "stop"
}
```

### 响应消息

- `status` - 连接状态
- `asr` - 语音识别结果
- `translation` - 翻译结果
- `audio` - TTS 音频
- `turnComplete` - 轮次结束
- `error` - 错误信息
