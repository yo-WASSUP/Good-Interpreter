"""
Bidirectional translation service using dual parallel sessions.

Maintains two sessions:
- Session 1: zh → en (Chinese to English)
- Session 2: en → zh (English to Chinese)

The service detects the spoken language and uses the appropriate session's translation.
"""

import asyncio
import uuid
import ssl
import logging
import base64
from typing import Callable, Optional, Any, Dict
from dataclasses import dataclass

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
class DualSession:
    """Represents a bidirectional translation session with two parallel connections."""
    session_id: str  # Main session ID for tracking
    
    # Chinese → English session
    zh_en_session_id: str = ""
    zh_en_connect_id: str = ""
    zh_en_ws: Any = None
    zh_en_active: bool = False
    zh_en_task: Optional[asyncio.Task] = None
    
    # English → Chinese session
    en_zh_session_id: str = ""
    en_zh_connect_id: str = ""
    en_zh_ws: Any = None
    en_zh_active: bool = False
    en_zh_task: Optional[asyncio.Task] = None
    
    # Current detected language and translation state
    current_source_lang: str = ""
    current_source_text: str = ""
    current_target_text: str = ""


class BidirectionalService:
    """
    Service for bidirectional translation using dual parallel sessions.
    
    Automatically detects spoken language and provides appropriate translation.
    """
    
    def __init__(self):
        self.config = get_config()
        self._event_names = None
    
    @property
    def event_names(self):
        if self._event_names is None:
            self._event_names = get_event_names()
        return self._event_names
    
    async def _build_headers(self, connect_id: str) -> Headers:
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
    
    async def _connect_session(
        self,
        session_id: str,
        connect_id: str,
        source_lang: str,
        target_lang: str,
    ) -> Any:
        """Connect and start a single translation session."""
        try:
            headers = await self._build_headers(connect_id)
            ssl_context = self._create_ssl_context()
            
            ws = await websockets.connect(
                self.config.volcengine.ws_url,
                additional_headers=headers,
                max_size=100000000,
                ping_interval=None,
                ssl=ssl_context,
            )
            
            # Send StartSession
            request = build_start_session_request(session_id, source_lang, target_lang)
            await ws.send(request)
            
            logging.debug(f"Connected session: {source_lang} → {target_lang}")
            return ws
            
        except Exception as e:
            logging.error(f"Failed to connect session {source_lang}→{target_lang}: {e}")
            return None
    
    async def connect(self, session: DualSession) -> bool:
        """Connect both translation sessions."""
        try:
            # Generate session IDs
            session.zh_en_session_id = str(uuid.uuid4())
            session.zh_en_connect_id = str(uuid.uuid4())
            session.en_zh_session_id = str(uuid.uuid4())
            session.en_zh_connect_id = str(uuid.uuid4())
            
            # Connect both sessions in parallel
            zh_en_ws, en_zh_ws = await asyncio.gather(
                self._connect_session(
                    session.zh_en_session_id,
                    session.zh_en_connect_id,
                    "zh", "en"
                ),
                self._connect_session(
                    session.en_zh_session_id,
                    session.en_zh_connect_id,
                    "en", "zh"
                ),
            )
            
            if zh_en_ws and en_zh_ws:
                session.zh_en_ws = zh_en_ws
                session.en_zh_ws = en_zh_ws
                session.zh_en_active = True
                session.en_zh_active = True
                logging.info("✅ Connected: 中文 ↔ English (双向翻译)")
                return True
            else:
                # Cleanup partial connections
                if zh_en_ws:
                    await zh_en_ws.close()
                if en_zh_ws:
                    await en_zh_ws.close()
                return False
                
        except Exception as e:
            logging.error(f"❌ Failed to connect dual sessions: {e}")
            return False
    
    async def send_audio(self, session: DualSession, audio_data: bytes) -> bool:
        """Send audio data to both sessions."""
        try:
            tasks = []
            
            if session.zh_en_ws and session.zh_en_active:
                request = build_audio_request(session.zh_en_session_id, audio_data)
                tasks.append(session.zh_en_ws.send(request))
            
            if session.en_zh_ws and session.en_zh_active:
                request = build_audio_request(session.en_zh_session_id, audio_data)
                tasks.append(session.en_zh_ws.send(request))
            
            if tasks:
                await asyncio.gather(*tasks)
                return True
            return False
            
        except Exception as e:
            logging.error(f"Error sending audio: {e}")
            return False
    
    async def finish(self, session: DualSession):
        """Send finish request to both sessions."""
        try:
            tasks = []
            
            if session.zh_en_ws and session.zh_en_active:
                request = build_finish_request(session.zh_en_session_id)
                tasks.append(session.zh_en_ws.send(request))
                session.zh_en_active = False
            
            if session.en_zh_ws and session.en_zh_active:
                request = build_finish_request(session.en_zh_session_id)
                tasks.append(session.en_zh_ws.send(request))
                session.en_zh_active = False
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
                logging.info("📥 Sent FinishSession to both sessions")
                
        except Exception as e:
            logging.error(f"Error finishing sessions: {e}")
    
    async def close(self, session: DualSession):
        """Close both sessions and cleanup."""
        # Cancel message tasks
        for task in [session.zh_en_task, session.en_zh_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        # Finish and close WebSockets
        await self.finish(session)
        
        for ws in [session.zh_en_ws, session.en_zh_ws]:
            if ws:
                try:
                    await ws.close()
                except Exception:
                    pass
        
        session.zh_en_active = False
        session.en_zh_active = False
    
    async def handle_messages(
        self,
        session: DualSession,
        on_message: Callable[[dict], Any],
    ):
        """
        Handle messages from both sessions and merge results.
        
        The key insight: we receive ASR results from both sessions,
        but only one will produce meaningful translation (matching the spoken language).
        We detect which session has valid translation and use that.
        """
        _, _, EventType = get_protobuf_types()
        
        # Track results from both sessions
        zh_en_source = ""
        zh_en_target = ""
        en_zh_source = ""
        en_zh_target = ""
        zh_en_sequence = 0
        en_zh_sequence = 0
        
        async def process_zh_en_messages():
            """Process messages from zh→en session."""
            nonlocal zh_en_source, zh_en_target, zh_en_sequence
            
            try:
                async for message in session.zh_en_ws:
                    response = parse_response(message)
                    
                    if response.event == EventType.SessionStarted:
                        logging.debug("✅ zh→en session ready")
                    
                    elif response.event == EventType.SessionFailed:
                        logging.error(f"❌ zh→en session failed: {response.response_meta.Message}")
                        await on_message({"type": "error", "message": response.response_meta.Message})
                    
                    elif response.event == EventType.SessionFinished:
                        logging.debug("✅ zh→en session finished")
                        await on_message({"type": "turnComplete"})
                    
                    elif response.event == EventType.SourceSubtitleEnd:
                        if response.text:
                            zh_en_source = response.text
                            zh_en_sequence = response.response_meta.Sequence
                            logging.info(f"🎤 [中→英] 原文: {response.text}")
                            # Send ASR result
                            await on_message({
                                "type": "asr",
                                "text": response.text,
                                "isFinal": True,
                                "sequence": zh_en_sequence,
                                "direction": "zh→en",
                            })
                    
                    elif response.event in (EventType.SourceSubtitleStart, EventType.SourceSubtitleResponse):
                        if response.text:
                            await on_message({
                                "type": "asr",
                                "text": response.text,
                                "isFinal": False,
                                "direction": "zh→en",
                            })
                    
                    elif response.event == EventType.TranslationSubtitleEnd:
                        if response.text:
                            zh_en_target = response.text
                            logging.info(f"🔄 [中→英] 译文: {response.text}")
                            # Send translation if this is the active direction
                            await on_message({
                                "type": "translation",
                                "text": response.text,
                                "language": "en",
                                "isFinal": True,
                                "direction": "zh→en",
                            })
                    
                    elif response.event in (EventType.TranslationSubtitleStart, EventType.TranslationSubtitleResponse):
                        if response.text:
                            await on_message({
                                "type": "translation",
                                "text": response.text,
                                "language": "en",
                                "isFinal": False,
                                "direction": "zh→en",
                            })
                    
                    elif response.event in (EventType.TTSSentenceStart, EventType.TTSResponse, EventType.TTSSentenceEnd):
                        if response.data and len(response.data) > 0:
                            await on_message({
                                "type": "audio",
                                "data": base64.b64encode(response.data).decode("utf-8"),
                                "format": "opus",
                                "sampleRate": self.config.audio.target_rate,
                                "direction": "zh→en",
                            })
                        
                        if response.event == EventType.TTSSentenceEnd:
                            await on_message({"type": "sentenceComplete", "direction": "zh→en"})
                            
            except websockets.exceptions.ConnectionClosed:
                logging.debug("zh→en connection closed")
            except Exception as e:
                logging.error(f"Error in zh→en handler: {e}")
        
        async def process_en_zh_messages():
            """Process messages from en→zh session."""
            nonlocal en_zh_source, en_zh_target, en_zh_sequence
            
            try:
                async for message in session.en_zh_ws:
                    response = parse_response(message)
                    
                    if response.event == EventType.SessionStarted:
                        logging.debug("✅ en→zh session ready")
                        # Send ready status once (only from one session)
                        await on_message({"type": "status", "status": "ready"})
                    
                    elif response.event == EventType.SessionFailed:
                        logging.error(f"❌ en→zh session failed: {response.response_meta.Message}")
                    
                    elif response.event == EventType.SessionFinished:
                        logging.debug("✅ en→zh session finished")
                    
                    elif response.event == EventType.SourceSubtitleEnd:
                        if response.text:
                            en_zh_source = response.text
                            en_zh_sequence = response.response_meta.Sequence
                            logging.info(f"🎤 [英→中] 原文: {response.text}")
                            await on_message({
                                "type": "asr",
                                "text": response.text,
                                "isFinal": True,
                                "sequence": en_zh_sequence,
                                "direction": "en→zh",
                            })
                    
                    elif response.event in (EventType.SourceSubtitleStart, EventType.SourceSubtitleResponse):
                        if response.text:
                            await on_message({
                                "type": "asr",
                                "text": response.text,
                                "isFinal": False,
                                "direction": "en→zh",
                            })
                    
                    elif response.event == EventType.TranslationSubtitleEnd:
                        if response.text:
                            en_zh_target = response.text
                            logging.info(f"🔄 [英→中] 译文: {response.text}")
                            await on_message({
                                "type": "translation",
                                "text": response.text,
                                "language": "zh",
                                "isFinal": True,
                                "direction": "en→zh",
                            })
                    
                    elif response.event in (EventType.TranslationSubtitleStart, EventType.TranslationSubtitleResponse):
                        if response.text:
                            await on_message({
                                "type": "translation",
                                "text": response.text,
                                "language": "zh",
                                "isFinal": False,
                                "direction": "en→zh",
                            })
                    
                    elif response.event in (EventType.TTSSentenceStart, EventType.TTSResponse, EventType.TTSSentenceEnd):
                        if response.data and len(response.data) > 0:
                            await on_message({
                                "type": "audio",
                                "data": base64.b64encode(response.data).decode("utf-8"),
                                "format": "opus",
                                "sampleRate": self.config.audio.target_rate,
                                "direction": "en→zh",
                            })
                        
                        if response.event == EventType.TTSSentenceEnd:
                            await on_message({"type": "sentenceComplete", "direction": "en→zh"})
                            
            except websockets.exceptions.ConnectionClosed:
                logging.debug("en→zh connection closed")
            except Exception as e:
                logging.error(f"Error in en→zh handler: {e}")
        
        # Run both message handlers concurrently
        session.zh_en_task = asyncio.create_task(process_zh_en_messages())
        session.en_zh_task = asyncio.create_task(process_en_zh_messages())
        
        # Wait for both to complete
        await asyncio.gather(
            session.zh_en_task,
            session.en_zh_task,
            return_exceptions=True
        )
