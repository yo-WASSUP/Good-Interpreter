"""
WebSocket route handler for browser connections.
Uses bidirectional translation service for zh ↔ en.
"""

import asyncio
import uuid
import json
import base64
import logging
import re

import aiohttp
from aiohttp import web

from ..services.bidirectional import BidirectionalService, DualSession
from ..database import get_database


def has_chinese(text: str) -> bool:
    """Check if text contains Chinese characters (CJK Unified Ideographs)."""
    # Unicode range for Chinese characters
    return bool(re.search(r'[\u4e00-\u9fff]', text))


def is_meaningful_text(text: str) -> bool:
    """
    Check if text contains meaningful content (not just punctuation).
    Returns False if text only contains punctuation, whitespace, or symbols.
    """
    if not text:
        return False
    
    # Remove common punctuation and whitespace
    cleaned = re.sub(r'[，。！？,.!?\s"""'']+', '', text)
    
    # If nothing left after removing punctuation, it's not meaningful
    return len(cleaned) > 0


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """Handle WebSocket connections from browser."""
    
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    logging.info("🌐 Browser client connected")
    
    # Get database
    db = get_database()
    
    # Create dual session
    session = DualSession(
        session_id=str(uuid.uuid4()),
    )
    
    # Track current conversation state with improved selection
    current_source_text = ""
    current_target_text = ""
    current_direction = ""
    
    # Track best ASR for each direction (prefer longer, more meaningful)
    zh_en_best_asr = {"text": "", "length": 0, "sequence": 0}
    en_zh_best_asr = {"text": "", "length": 0, "sequence": 0}
    
    # Track which direction is currently active
    active_direction = ""
    
    message_sequence = 0
    db_session_created = False
    
    # Initialize service
    service = BidirectionalService()
    
    async def send_to_browser(message: dict):
        """Send message to browser WebSocket with smart direction selection."""
        nonlocal current_source_text, current_target_text, current_direction
        nonlocal message_sequence, db_session_created, active_direction
        nonlocal zh_en_best_asr, en_zh_best_asr
        
        if ws.closed:
            return
        
        msg_type = message.get("type")
        direction = message.get("direction", "")
        
        # Handle ASR (speech recognition)
        if msg_type == "asr":
            text = message.get("text", "").strip()
            is_final = message.get("isFinal", False)
            seq = message.get("sequence", 0)
            
            # Skip empty text or text that's only punctuation
            if not text or not is_meaningful_text(text):
                return
            
            # Detect language from ASR text
            detected_chinese = has_chinese(text)
            
            # Determine expected direction for this language
            if detected_chinese:
                expected_direction = "zh→en"  # Chinese should go to zh→en session
            else:
                expected_direction = "en→zh"  # English should go to en→zh session
            
            # CRITICAL: Validate that the direction matches the detected language
            # zh→en session should only process Chinese text
            # en→zh session should only process English text
            if direction == "zh→en" and not detected_chinese:
                # zh→en session got English text - REJECT
                logging.debug(f"⏭️  Rejected English text from zh→en session")
                return
            elif direction == "en→zh" and detected_chinese:
                # en→zh session got Chinese text - REJECT
                logging.debug(f"⏭️  Rejected Chinese text from en→zh session")
                return
            
            # For final ASR - LOCK direction based on FIRST valid final ASR
            if is_final:
                # If we already have an active direction for this sentence
                if active_direction:
                    # Only accept final ASR from active direction
                    if direction != active_direction:
                        logging.debug(f"⏭️  Rejected ASR from {direction} (locked to {active_direction})")
                        return
                    
                    # Update with new text from active direction
                    current_source_text = text
                    
                    logging.info(f"✅ Updated ASR ({active_direction}): {text}")
                    
                    await ws.send_str(json.dumps({
                        "type": "asr",
                        "text": text,
                        "isFinal": True,
                    }))
                else:
                    # No active direction yet - FIRST valid final ASR determines direction
                    # The direction is already validated above (language matches session)
                    active_direction = expected_direction
                    current_source_text = text
                    current_direction = active_direction
                    
                    logging.info(f"🔒 LOCKED to {active_direction}: {text}")
                    
                    await ws.send_str(json.dumps({
                        "type": "asr",
                        "text": text,
                        "isFinal": True,
                    }))
            
            # For interim ASR - only show if matches active direction (or no direction yet)
            else:
                # If we have active direction, only show interim from that direction
                if active_direction:
                    if direction != active_direction:
                        return
                    
                    await ws.send_str(json.dumps({
                        "type": "asr",
                        "text": text,
                        "isFinal": False,
                    }))
                else:
                    # No active direction yet - show interim from expected direction
                    if direction == expected_direction:
                        await ws.send_str(json.dumps({
                            "type": "asr",
                            "text": text,
                            "isFinal": False,
                        }))
        
        # Handle translation - ONLY from active direction
        elif msg_type == "translation":
            # Must match the active direction determined by ASR
            if direction == active_direction or direction == current_direction:
                text = message.get("text", "")
                current_target_text = text
                
                logging.debug(f"📋 Translation ({direction}): {text[:30]}...")
                
                await ws.send_str(json.dumps({
                    "type": "translation",
                    "text": text,
                    "language": message.get("language", "en"),
                    "isFinal": message.get("isFinal", False),
                }))
            else:
                logging.debug(f"⏭️  Skipped translation ({direction}), active is ({active_direction})")
        
        # Handle audio - STRICTLY only from active direction
        elif msg_type == "audio":
            # CRITICAL: Only play audio from the active translation direction
            if direction == active_direction:
                await ws.send_str(json.dumps({
                    "type": "audio",
                    "data": message.get("data"),
                    "format": message.get("format"),
                    "sampleRate": message.get("sampleRate"),
                }))
            else:
                logging.debug(f"🔇 Muted audio from ({direction}), active is ({active_direction})")
        
        # Handle sentence complete - save to database
        elif msg_type == "sentenceComplete":
            if direction == active_direction and (current_source_text or current_target_text):
                # Send to frontend
                await ws.send_str(json.dumps({"type": "sentenceComplete"}))
                
                # Save to database
                try:
                    source_lang = "zh" if current_direction == "zh→en" else "en"
                    target_lang = "en" if current_direction == "zh→en" else "zh"
                    
                    db.add_message(
                        session_id=session.session_id,
                        source_text=current_source_text,
                        target_text=current_target_text,
                        source_language=source_lang,
                        target_language=target_lang,
                        sequence=message_sequence,
                    )
                    message_sequence += 1
                    logging.info(f"💾 Saved: {current_source_text[:30]}... -> {current_target_text[:30]}...")
                except Exception as e:
                    logging.error(f"Failed to save message: {e}")
                
                # Reset for next sentence
                current_source_text = ""
                current_target_text = ""
                active_direction = ""  # Allow next sentence to determine direction
                zh_en_best_asr = {"text": "", "length": 0, "sequence": 0}
                en_zh_best_asr = {"text": "", "length": 0, "sequence": 0}
        
        # Handle status events
        elif msg_type == "status":
            await ws.send_str(json.dumps(message))
        
        # Handle turn complete
        elif msg_type == "turnComplete":
            await ws.send_str(json.dumps({"type": "turnComplete"}))
            # Reset active direction
            active_direction = ""
        
        # Handle errors
        elif msg_type == "error":
            await ws.send_str(json.dumps(message))
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                msg_type = data.get("type")
                
                if msg_type == "start":
                    logging.info("📤 Starting bidirectional translation: 中文 ↔ English")
                    
                    # Create session in database
                    try:
                        db.create_session(
                            session_id=session.session_id,
                            source_language="zh",
                            target_language="en",
                            title="双向翻译会议",
                        )
                        db_session_created = True
                    except Exception as e:
                        logging.error(f"Failed to create session in DB: {e}")
                    
                    # Send session ID to frontend
                    await ws.send_str(json.dumps({
                        "type": "sessionCreated",
                        "sessionId": session.session_id,
                    }))
                    
                    # Connect both translation sessions
                    if await service.connect(session):
                        # Start message handler (runs in background)
                        asyncio.create_task(
                            service.handle_messages(session, send_to_browser)
                        )
                    else:
                        await ws.send_str(json.dumps({
                            "type": "error",
                            "message": "Failed to connect to translation service",
                        }))
                
                elif msg_type == "audio":
                    # Decode and forward audio data to both sessions
                    audio_data = base64.b64decode(data.get("data", ""))
                    await service.send_audio(session, audio_data)
                
                elif msg_type == "stop":
                    # Finish both sessions
                    await service.finish(session)
                    
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
