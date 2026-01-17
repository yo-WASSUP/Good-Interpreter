"""
Volcengine AST service for real-time translation.
"""

import asyncio
import ssl
import logging
import base64
import json
from typing import Callable, Optional, Any
from dataclasses import dataclass, field

import websockets
from websockets import Headers

from ..config import get_config
from ..utils.protobuf import (
    get_protobuf_types,
    get_event_names,
    build_start_session_request,
    build_audio_request,
    build_finish_request,
    parse_response,
)


@dataclass
class TranslationSession:
    """Represents an active translation session."""
    session_id: str
    connect_id: str
    source_lang: str = "zh"
    target_lang: str = "en"
    is_active: bool = False
    volcengine_ws: Any = None
    message_task: Optional[asyncio.Task] = None


class VolcengineService:
    """Service for interacting with Volcengine AST API."""
    
    def __init__(self):
        self.config = get_config()
        self._event_names = None
    
    @property
    def event_names(self):
        """Lazy-load event names."""
        if self._event_names is None:
            self._event_names = get_event_names()
        return self._event_names
    
    async def build_headers(self, connect_id: str) -> Headers:
        """Build WebSocket connection headers."""
        return Headers({
            "X-Api-App-Key": self.config.volcengine.app_key,
            "X-Api-Access-Key": self.config.volcengine.access_key,
            "X-Api-Resource-Id": self.config.volcengine.resource_id,
            "X-Api-Connect-Id": connect_id,
        })
    
    def _create_ssl_context(self) -> ssl.SSLContext:
        """Create SSL context (with cert verification disabled for macOS)."""
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        return ssl_context
    
    async def connect(self, session: TranslationSession) -> bool:
        """Connect to Volcengine AST API."""
        try:
            headers = await self.build_headers(session.connect_id)
            ssl_context = self._create_ssl_context()
            
            session.volcengine_ws = await websockets.connect(
                self.config.volcengine.ws_url,
                additional_headers=headers,
                max_size=100000000,
                ping_interval=None,
                ssl=ssl_context,
            )
            
            logging.info("✅ Connected to Volcengine AST API")
            return True
            
        except Exception as e:
            logging.error(f"❌ Failed to connect to Volcengine: {e}")
            return False
    
    async def start_session(self, session: TranslationSession) -> bool:
        """Send StartSession request."""
        if not session.volcengine_ws:
            return False
        
        try:
            request = build_start_session_request(
                session.session_id,
                session.source_lang,
                session.target_lang,
            )
            await session.volcengine_ws.send(request)
            session.is_active = True
            logging.info(f"📤 Session started: {session.source_lang} → {session.target_lang}")
            return True
            
        except Exception as e:
            logging.error(f"❌ Failed to start session: {e}")
            return False
    
    async def send_audio(self, session: TranslationSession, audio_data: bytes) -> bool:
        """Send audio data to Volcengine."""
        if not session.volcengine_ws or not session.is_active:
            return False
        
        try:
            request = build_audio_request(session.session_id, audio_data)
            await session.volcengine_ws.send(request)
            return True
            
        except Exception as e:
            logging.error(f"Error sending audio: {e}")
            return False
    
    async def finish_session(self, session: TranslationSession) -> bool:
        """Send FinishSession request."""
        if not session.volcengine_ws or not session.is_active:
            return False
        
        try:
            request = build_finish_request(session.session_id)
            await session.volcengine_ws.send(request)
            logging.info("📥 Sent FinishSession request")
            return True
            
        except Exception as e:
            logging.error(f"Error finishing session: {e}")
            return False
    
    async def close(self, session: TranslationSession):
        """Close the session and cleanup resources."""
        # Cancel message task
        if session.message_task:
            session.message_task.cancel()
            try:
                await session.message_task
            except asyncio.CancelledError:
                pass
        
        # Close WebSocket
        if session.volcengine_ws:
            if session.is_active:
                try:
                    await self.finish_session(session)
                except Exception:
                    pass
            
            await session.volcengine_ws.close()
        
        session.is_active = False
    
    async def handle_messages(
        self,
        session: TranslationSession,
        on_message: Callable[[dict], Any],
    ):
        """
        Handle messages from Volcengine and call callback for each message.
        
        Args:
            session: The translation session
            on_message: Callback function that receives parsed messages
        """
        _, _, EventType = get_protobuf_types()
        
        try:
            async for message in session.volcengine_ws:
                response = parse_response(message)
                event_name = self.event_names.get(
                    response.event, f"Unknown({response.event})"
                )
                
                browser_msg = None
                
                # Session status events
                if response.event == EventType.SessionStarted:
                    logging.info("✅ Session ready")
                    browser_msg = {"type": "status", "status": "ready"}
                
                elif response.event == EventType.SessionFailed:
                    error_msg = response.response_meta.Message or "Session failed"
                    logging.error(f"❌ Session failed: {error_msg}")
                    browser_msg = {"type": "error", "message": error_msg}
                
                elif response.event == EventType.SessionFinished:
                    logging.info("✅ Session finished")
                    browser_msg = {"type": "turnComplete"}
                
                # ASR (speech recognition) events
                elif response.event == EventType.SourceSubtitleEnd:
                    if response.text:
                        logging.info(f"🎤 原文: {response.text}")
                        browser_msg = {
                            "type": "asr",
                            "text": response.text,
                            "isFinal": True,
                            "sequence": response.response_meta.Sequence,
                        }
                
                elif response.event in (
                    EventType.SourceSubtitleStart,
                    EventType.SourceSubtitleResponse,
                ):
                    if response.text:
                        browser_msg = {
                            "type": "asr",
                            "text": response.text,
                            "isFinal": False,
                            "sequence": response.response_meta.Sequence,
                        }
                
                # Translation events
                elif response.event == EventType.TranslationSubtitleEnd:
                    if response.text:
                        logging.info(f"🔄 译文: {response.text}")
                        browser_msg = {
                            "type": "translation",
                            "text": response.text,
                            "language": session.target_lang,
                            "isFinal": True,
                            "sequence": response.response_meta.Sequence,
                        }
                
                elif response.event in (
                    EventType.TranslationSubtitleStart,
                    EventType.TranslationSubtitleResponse,
                ):
                    if response.text:
                        browser_msg = {
                            "type": "translation",
                            "text": response.text,
                            "language": session.target_lang,
                            "isFinal": False,
                            "sequence": response.response_meta.Sequence,
                        }
                
                # TTS (text-to-speech) events
                elif response.event in (
                    EventType.TTSSentenceStart,
                    EventType.TTSResponse,
                    EventType.TTSSentenceEnd,
                ):
                    if response.data and len(response.data) > 0:
                        browser_msg = {
                            "type": "audio",
                            "data": base64.b64encode(response.data).decode("utf-8"),
                            "format": "opus",
                            "sampleRate": self.config.audio.target_rate,
                        }
                
                # Send message to browser
                if browser_msg:
                    await on_message(browser_msg)
        
        except websockets.exceptions.ConnectionClosed:
            logging.info("Volcengine connection closed")
        except Exception as e:
            logging.error(f"Error handling Volcengine messages: {e}")
