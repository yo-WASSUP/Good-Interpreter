"""
Protobuf utilities for Volcengine AST API.
"""

import sys
import os
import logging
from typing import Optional

from ..config import get_config

# Lazy-loaded protobuf types
_TranslateRequest = None
_TranslateResponse = None
_EventType = None


def _setup_protobuf_path():
    """Add protobuf directory to Python path."""
    config = get_config()
    
    if config.protobuf_dir and config.protobuf_dir.exists():
        protobuf_path = str(config.protobuf_dir)
        if protobuf_path not in sys.path:
            sys.path.insert(0, protobuf_path)
            logging.debug(f"Added protobuf path: {protobuf_path}")
        return True
    
    # Fallback: check web-app/ast_python
    fallback_path = config.base_dir.parent / "web-app" / "ast_python"
    if fallback_path.exists():
        fallback_str = str(fallback_path)
        if fallback_str not in sys.path:
            sys.path.insert(0, fallback_str)
            logging.debug(f"Added fallback protobuf path: {fallback_str}")
        return True
    
    return False


def get_protobuf_types():
    """Get protobuf types, importing lazily."""
    global _TranslateRequest, _TranslateResponse, _EventType
    
    if _TranslateRequest is None:
        _setup_protobuf_path()
        
        try:
            from python_protogen.products.understanding.ast.ast_service_pb2 import (
                TranslateRequest,
                TranslateResponse,
            )
            from python_protogen.common.events_pb2 import Type as EventType
            
            _TranslateRequest = TranslateRequest
            _TranslateResponse = TranslateResponse
            _EventType = EventType
            
            logging.info("✅ Protobuf schema loaded")
            
        except ImportError as e:
            logging.error(f"❌ Failed to import protobuf types: {e}")
            raise
    
    return _TranslateRequest, _TranslateResponse, _EventType


# Event type names for logging
def get_event_names():
    """Get human-readable event type names."""
    _, _, EventType = get_protobuf_types()
    
    return {
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


def build_start_session_request(
    session_id: str,
    source_lang: str,
    target_lang: str,
) -> bytes:
    """Build StartSession protobuf request."""
    TranslateRequest, _, EventType = get_protobuf_types()
    config = get_config()
    
    request = TranslateRequest()
    request.request_meta.SessionID = session_id
    request.event = EventType.StartSession
    
    # User info
    request.user.uid = "web_translator"
    request.user.did = "web_translator"
    request.user.platform = "web"
    request.user.sdk_version = "1.0.0"
    
    # Source audio config
    request.source_audio.format = config.audio.source_format
    request.source_audio.rate = config.audio.source_rate
    request.source_audio.bits = config.audio.source_bits
    request.source_audio.channel = config.audio.source_channel
    
    # Target audio config
    request.target_audio.format = config.audio.target_format
    request.target_audio.rate = config.audio.target_rate
    
    # Translation request
    request.request.mode = "s2s"
    request.request.source_language = source_lang
    request.request.target_language = target_lang
    
    return request.SerializeToString()


def build_audio_request(session_id: str, audio_data: bytes) -> bytes:
    """Build TaskRequest protobuf request with audio data."""
    TranslateRequest, _, EventType = get_protobuf_types()
    
    request = TranslateRequest()
    request.request_meta.SessionID = session_id
    request.event = EventType.TaskRequest
    request.source_audio.binary_data = audio_data
    
    return request.SerializeToString()


def build_finish_request(session_id: str) -> bytes:
    """Build FinishSession protobuf request."""
    TranslateRequest, _, EventType = get_protobuf_types()
    
    request = TranslateRequest()
    request.request_meta.SessionID = session_id
    request.event = EventType.FinishSession
    
    return request.SerializeToString()


def parse_response(data: bytes):
    """Parse protobuf response."""
    _, TranslateResponse, _ = get_protobuf_types()
    
    response = TranslateResponse()
    response.ParseFromString(data)
    
    return response
