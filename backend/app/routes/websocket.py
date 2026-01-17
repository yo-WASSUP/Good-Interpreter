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
from ..database import get_database


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """Handle WebSocket connections from browser."""
    
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    logging.info("🌐 Browser client connected")
    
    # Get database
    db = get_database()
    
    # Create session
    session = TranslationSession(
        session_id=str(uuid.uuid4()),
        connect_id=str(uuid.uuid4()),
    )
    
    # Track current sentence for database storage
    current_source_text = ""
    current_target_text = ""
    message_sequence = 0
    db_session_created = False
    
    # Initialize service
    service = VolcengineService()
    
    async def send_to_browser(message: dict):
        """Send message to browser WebSocket and handle database storage."""
        nonlocal current_source_text, current_target_text, message_sequence, db_session_created
        
        if not ws.closed:
            await ws.send_str(json.dumps(message))
        
        # Store ASR final results
        if message.get("type") == "asr" and message.get("isFinal"):
            current_source_text = message.get("text", "")
        
        # Store translation final results
        if message.get("type") == "translation" and message.get("isFinal"):
            current_target_text = message.get("text", "")
        
        # On sentence complete, save to database
        if message.get("type") == "sentenceComplete":
            if current_source_text or current_target_text:
                try:
                    db.add_message(
                        session_id=session.session_id,
                        source_text=current_source_text,
                        target_text=current_target_text,
                        source_language=session.source_lang,
                        target_language=session.target_lang,
                        sequence=message_sequence,
                    )
                    message_sequence += 1
                    logging.debug(f"💾 Saved message: {current_source_text[:30]}...")
                except Exception as e:
                    logging.error(f"Failed to save message: {e}")
                
                # Reset for next sentence
                current_source_text = ""
                current_target_text = ""
    
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
                    
                    # Create session in database
                    try:
                        db.create_session(
                            session_id=session.session_id,
                            source_language=session.source_lang,
                            target_language=session.target_lang,
                        )
                        db_session_created = True
                        logging.debug(f"💾 Created session: {session.session_id}")
                    except Exception as e:
                        logging.error(f"Failed to create session in DB: {e}")
                    
                    # Send session ID to frontend
                    await ws.send_str(json.dumps({
                        "type": "sessionCreated",
                        "sessionId": session.session_id,
                    }))
                    
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
                    
                    # Mark session as ended in database
                    if db_session_created:
                        try:
                            db.end_session(session.session_id)
                        except Exception as e:
                            logging.error(f"Failed to end session in DB: {e}")
            
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logging.error(f"WebSocket error: {ws.exception()}")
    
    except Exception as e:
        logging.error(f"Error in websocket handler: {e}")
    
    finally:
        logging.info("🌐 Browser client disconnected")
        await service.close(session)
        
        # End session in database if still active
        if db_session_created:
            try:
                db.end_session(session.session_id)
            except Exception:
                pass
    
    return ws
