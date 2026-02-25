"""
Configuration management for the backend service.
"""

import os
import sys
import logging
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


@dataclass
class VolcengineConfig:
    """Volcengine AST API configuration."""
    ws_url: str = "wss://openspeech.bytedance.com/api/v4/ast/v2/translate"
    app_key: str = ""
    access_key: str = ""
    resource_id: str = "volc.service_type.10053"


@dataclass
class AudioConfig:
    """Audio format configuration."""
    # Source audio (from browser)
    source_format: str = "wav"
    source_rate: int = 16000
    source_bits: int = 16
    source_channel: int = 1
    
    # Target audio (TTS output)
    target_format: str = "ogg_opus"
    target_rate: int = 24000


@dataclass
class ServerConfig:
    """Server configuration."""
    host: str = "0.0.0.0"
    port: int = 3000
    debug: bool = False


@dataclass
class Config:
    """Main configuration class."""
    volcengine: VolcengineConfig = field(default_factory=VolcengineConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    
    # Paths
    base_dir: Path = field(default_factory=lambda: Path(__file__).parent.parent)
    protobuf_dir: Optional[Path] = None
    
    def __post_init__(self):
        # Set protobuf directory (for AST SDK)
        if self.protobuf_dir is None:
            self.protobuf_dir = self.base_dir / "ast_python"


def load_config() -> Config:
    """Load configuration from environment variables."""
    
    volcengine = VolcengineConfig(
        app_key=os.getenv("VOLC_APP_ID", ""),
        access_key=os.getenv("VOLC_ACCESS_KEY", ""),
    )
    
    server = ServerConfig(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 3000)),
        debug=os.getenv("DEBUG", "false").lower() == "true",
    )
    
    config = Config(
        volcengine=volcengine,
        server=server,
    )
    
    return config


def validate_config(config: Config) -> bool:
    """Validate configuration and check required values."""
    
    if not config.volcengine.app_key or not config.volcengine.access_key:
        logging.error("❌ VOLC_APP_ID or VOLC_ACCESS_KEY is not set!")
        logging.error("Please add them to your .env file:")
        logging.error("  VOLC_APP_ID=your_app_id")
        logging.error("  VOLC_ACCESS_KEY=your_access_key")
        return False
    
    # Check if protobuf directory exists
    if config.protobuf_dir and not config.protobuf_dir.exists():
        logging.warning(f"⚠️ Protobuf directory not found: {config.protobuf_dir}")
    
    return True


# Global configuration instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = load_config()
    return _config
