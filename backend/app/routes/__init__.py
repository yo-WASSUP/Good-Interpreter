"""Routes package."""

from .websocket import websocket_handler
from .api import setup_api_routes

__all__ = ["websocket_handler", "setup_api_routes"]
