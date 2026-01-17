"""
火山引擎同声传译 Python 后端服务
基于官方 AST 2.0 Python Demo 实现
"""
import asyncio
import uuid
import os
import sys
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
import json
import base64

# Web server dependencies
from aiohttp import web
import aiohttp

# Volcengine AST dependencies
import websockets
from websockets import Headers

# Add protogen path - need to add ast_python dir so that python_protogen can# Add protogen path - need to add ast_python dir so that python_protogen can be found
current_dir = os.path.dirname(os.path.abspath(__file__))
ast_python_dir = os.path.join(current_dir, "ast_python")
if ast_python_dir not in sys.path:
    sys.path.insert(0, ast_python_dir)

from python_protogen.products.understanding.ast.ast_service_pb2 import TranslateRequest, TranslateResponse
from python_protogen.common.events_pb2 import Type as EventType

# Configuration
@dataclass
class Config:
    ws_url: str = "wss://openspeech.bytedance.com/api/v4/ast/v2/translate"
    app_key: str = ""
    access_key: str = ""
    resource_id: str = "volc.service_type.10053"

# Load credentials from environment
from dotenv import load_dotenv
load_dotenv()

config = Config(
    app_key=os.getenv("VOLC_APP_ID", ""),
    access_key=os.getenv("VOLC_ACCESS_KEY", "")
)

if not config.app_key or not config.access_key:
    logging.error("❌ VOLC_APP_ID or VOLC_ACCESS_KEY is not set!")
    logging.error("Please add them to your .env file")
    sys.exit(1)

logging.info("✅ Volcengine API credentials configured")

# Event type names for logging
# Use 0 for None since 'None' may be a keyword
EVENT_NAMES = {
    0: "None",
    EventType.StartSession: "StartSession",
    EventType.FinishSession: "FinishSession",
    EventType.SessionStarted: "SessionStarted",
    EventType.SessionFailed: "SessionFailed",
    EventType.SessionFinished: "SessionFinished",
    EventType.TaskRequest: "TaskRequest",
    EventType.UsageResponse: "UsageResponse",
    EventType.SourceSubtitleStart: "SourceSubtitleStart",
    EventType.SourceSubtitleResponse: "SourceSubtitleResponse",
    EventType.SourceSubtitleEnd: "SourceSubtitleEnd",
    EventType.TranslationSubtitleStart: "TranslationSubtitleStart",
    EventType.TranslationSubtitleResponse: "TranslationSubtitleResponse",
    EventType.TranslationSubtitleEnd: "TranslationSubtitleEnd",
    EventType.TTSSentenceStart: "TTSSentenceStart",
    EventType.TTSResponse: "TTSResponse",
    EventType.TTSSentenceEnd: "TTSSentenceEnd",
    EventType.AudioMuted: "AudioMuted",
}

async def build_http_headers(conn_id: str) -> Headers:
    """Build WebSocket connection headers"""
    return Headers({
        "X-Api-App-Key": config.app_key,
        "X-Api-Access-Key": config.access_key,
        "X-Api-Resource-Id": config.resource_id,
        "X-Api-Connect-Id": conn_id
    })

def build_start_session_request(session_id: str, source_lang: str, target_lang: str) -> bytes:
    """Build StartSession protobuf request"""
    request = TranslateRequest()
    request.request_meta.SessionID = session_id
    request.event = EventType.StartSession
    request.user.uid = "web_translator"
    request.user.did = "web_translator"
    request.user.platform = "web"
    request.user.sdk_version = "1.0.0"
    request.source_audio.format = "wav"
    request.source_audio.rate = 16000
    request.source_audio.bits = 16
    request.source_audio.channel = 1
    request.target_audio.format = "ogg_opus"
    request.target_audio.rate = 24000
    request.request.mode = "s2s"
    request.request.source_language = source_lang
    request.request.target_language = target_lang
    return request.SerializeToString()

def build_audio_request(session_id: str, audio_data: bytes) -> bytes:
    """Build TaskRequest protobuf request with audio data"""
    request = TranslateRequest()
    request.request_meta.SessionID = session_id
    request.event = EventType.TaskRequest
    request.source_audio.binary_data = audio_data
    return request.SerializeToString()

def build_finish_request(session_id: str) -> bytes:
    """Build FinishSession protobuf request"""
    request = TranslateRequest()
    request.request_meta.SessionID = session_id
    request.event = EventType.FinishSession
    return request.SerializeToString()

def parse_response(data: bytes) -> TranslateResponse:
    """Parse protobuf response"""
    response = TranslateResponse()
    response.ParseFromString(data)
    return response

# Store active sessions
active_sessions = {}

async def handle_volcengine_messages(volc_ws, browser_ws, session_id: str, target_lang: str):
    """Handle messages from Volcengine and forward to browser"""
    try:
        async for message in volc_ws:
            response = parse_response(message)
            event_name = EVENT_NAMES.get(response.event, f"Unknown({response.event})")
            
            # Build message for browser
            browser_msg = None
            
            if response.event == EventType.SessionStarted:
                logging.info("✅ Session ready")
                browser_msg = {"type": "status", "status": "ready"}
                
            elif response.event == EventType.SessionFailed:
                logging.error(f"❌ Session failed: {response.response_meta.Message}")
                browser_msg = {"type": "error", "message": response.response_meta.Message or "Session failed"}
                
            elif response.event == EventType.SessionFinished:
                logging.info("✅ Session finished")
                browser_msg = {"type": "turnComplete"}
                
            elif response.event == EventType.SourceSubtitleEnd:
                if response.text:
                    logging.info(f"🎤 原文: {response.text}")
                    browser_msg = {
                        "type": "asr",
                        "text": response.text,
                        "isFinal": True,
                        "sequence": response.response_meta.Sequence
                    }
                    
            elif response.event in (EventType.SourceSubtitleStart, EventType.SourceSubtitleResponse):
                if response.text:
                    browser_msg = {
                        "type": "asr",
                        "text": response.text,
                        "isFinal": False,
                        "sequence": response.response_meta.Sequence
                    }
                    
            elif response.event == EventType.TranslationSubtitleEnd:
                if response.text:
                    logging.info(f"🔄 译文: {response.text}")
                    browser_msg = {
                        "type": "translation",
                        "text": response.text,
                        "language": target_lang,
                        "isFinal": True,
                        "sequence": response.response_meta.Sequence
                    }
                    
            elif response.event in (EventType.TranslationSubtitleStart, EventType.TranslationSubtitleResponse):
                if response.text:
                    browser_msg = {
                        "type": "translation",
                        "text": response.text,
                        "language": target_lang,
                        "isFinal": False,
                        "sequence": response.response_meta.Sequence
                    }
                    
            elif response.event in (EventType.TTSSentenceStart, EventType.TTSResponse, EventType.TTSSentenceEnd):
                if response.data and len(response.data) > 0:
                    browser_msg = {
                        "type": "audio",
                        "data": base64.b64encode(response.data).decode('utf-8'),
                        "format": "opus",
                        "sampleRate": 24000
                    }
            
            # Send to browser
            if browser_msg:
                await browser_ws.send_str(json.dumps(browser_msg))
                
    except websockets.exceptions.ConnectionClosed:
        logging.info("Volcengine connection closed")
    except Exception as e:
        logging.error(f"Error handling Volcengine messages: {e}")

async def websocket_handler(request):
    """Handle WebSocket connections from browser"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    logging.info("🌐 Browser client connected")
    
    session_id = str(uuid.uuid4())
    connect_id = str(uuid.uuid4())
    volc_ws = None
    source_lang = "zh"
    target_lang = "en"
    is_session_active = False
    volc_task = None
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                
                if data.get("type") == "start":
                    source_lang = data.get("sourceLanguage", "zh")
                    target_lang = data.get("targetLanguage", "en")
                    
                    logging.info(f"📤 Starting translation: {source_lang} → {target_lang}")
                    
                    # Connect to Volcengine
                    headers = await build_http_headers(connect_id)
                    volc_ws = await websockets.connect(
                        config.ws_url,
                        additional_headers=headers,
                        max_size=100000000,
                        ping_interval=None
                    )
                    
                    logging.info("✅ Connected to Volcengine AST API")
                    
                    # Send StartSession
                    start_request = build_start_session_request(session_id, source_lang, target_lang)
                    await volc_ws.send(start_request)
                    
                    is_session_active = True
                    
                    # Start background task to handle Volcengine responses
                    volc_task = asyncio.create_task(
                        handle_volcengine_messages(volc_ws, ws, session_id, target_lang)
                    )
                    
                elif data.get("type") == "audio" and volc_ws and is_session_active:
                    # Decode base64 audio and send to Volcengine
                    audio_data = base64.b64decode(data.get("data", ""))
                    audio_request = build_audio_request(session_id, audio_data)
                    await volc_ws.send(audio_request)
                    
                elif data.get("type") == "stop" and volc_ws and is_session_active:
                    # Send FinishSession
                    finish_request = build_finish_request(session_id)
                    await volc_ws.send(finish_request)
                    logging.info("📥 Sent FinishSession request")
                    
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logging.error(f"WebSocket error: {ws.exception()}")
                
    except Exception as e:
        logging.error(f"Error in websocket handler: {e}")
    finally:
        logging.info("🌐 Browser client disconnected")
        
        # Cleanup
        if volc_task:
            volc_task.cancel()
            try:
                await volc_task
            except asyncio.CancelledError:
                pass
                
        if volc_ws:
            if is_session_active:
                try:
                    finish_request = build_finish_request(session_id)
                    await volc_ws.send(finish_request)
                except:
                    pass
            await volc_ws.close()
            
    return ws

async def index_handler(request):
    """Serve index-volcengine.html as default"""
    return web.FileResponse(Path(__file__).parent / "public" / "index-volcengine.html")

def create_app():
    """Create and configure the web application"""
    app = web.Application()
    
    # Routes
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_static("/", Path(__file__).parent / "public")
    
    return app

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s"
    )
    
    logging.info("🚀 Starting Python backend server...")
    logging.info("✅ Protobuf schema loaded")
    
    app = create_app()
    
    port = int(os.getenv("PORT", 3000))
    logging.info(f"🌐 Server running at http://localhost:{port}")
    logging.info("📡 WebSocket endpoint: ws://localhost:{port}/ws")
    logging.info("🔊 Using Volcengine AST 2.0 API (Python Protobuf)")
    
    web.run_app(app, host="0.0.0.0", port=port, print=None)
