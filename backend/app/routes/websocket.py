"""
WebSocket route handler for browser connections.
"""

import asyncio
import uuid
import json
import base64
import logging

import aiohttp
from aiohttp import web

from ..services.volcengine import VolcengineService, TranslationSession


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """Handle WebSocket connections from browser."""
    
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    logging.info("🌐 Browser client connected")
    
    # Create session
    session = TranslationSession(
        session_id=str(uuid.uuid4()),
        connect_id=str(uuid.uuid4()),
    )
    
    # Initialize service
    service = VolcengineService()
    
    async def send_to_browser(message: dict):
        """Send message to browser WebSocket."""
        if not ws.closed:
            await ws.send_str(json.dumps(message))
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                msg_type = data.get("type")
                
                if msg_type == "start":
                    # Start translation session
                    session.source_lang = data.get("sourceLanguage", "zh")
                    session.target_lang = data.get("targetLanguage", "en")
                    
                    logging.info(
                        f"📤 Starting translation: "
                        f"{session.source_lang} → {session.target_lang}"
                    )
                    
                    # Connect to Volcengine
                    if await service.connect(session):
                        # Start session
                        await service.start_session(session)
                        
                        # Start background task to handle messages
                        session.message_task = asyncio.create_task(
                            service.handle_messages(session, send_to_browser)
                        )
                
                elif msg_type == "audio" and session.is_active:
                    # Decode and forward audio data
                    audio_data = base64.b64decode(data.get("data", ""))
                    await service.send_audio(session, audio_data)
                
                elif msg_type == "stop" and session.is_active:
                    # Finish session
                    await service.finish_session(session)
            
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logging.error(f"WebSocket error: {ws.exception()}")
    
    except Exception as e:
        logging.error(f"Error in websocket handler: {e}")
    
    finally:
        logging.info("🌐 Browser client disconnected")
        await service.close(session)
    
    return ws
