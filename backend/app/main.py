"""
Main application entry point.

火山引擎同声传译 Python 后端服务
"""

import logging
import sys
from pathlib import Path

from aiohttp import web

from .config import get_config, validate_config
from .routes import websocket_handler


def setup_logging(debug: bool = False):
    """Configure logging."""
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(message)s" if not debug else "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


async def index_handler(request: web.Request) -> web.FileResponse:
    """Serve the frontend index file."""
    # Try to serve from frontend dist, fallback to web-app public
    config = get_config()
    
    # Check frontend dist first
    frontend_dist = config.base_dir.parent / "frontend" / "dist" / "index.html"
    if frontend_dist.exists():
        return web.FileResponse(frontend_dist)
    
    # Fallback to web-app public
    web_app_index = config.base_dir.parent / "web-app" / "public" / "index-volcengine.html"
    if web_app_index.exists():
        return web.FileResponse(web_app_index)
    
    # Return simple HTML if no frontend found
    return web.Response(
        text="<h1>Backend is running</h1><p>Frontend not found. Run 'npm run build' in frontend directory.</p>",
        content_type="text/html",
    )


def create_app() -> web.Application:
    """Create and configure the web application."""
    app = web.Application()
    config = get_config()
    
    # Routes
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", websocket_handler)
    
    # Static files - serve frontend dist if exists
    frontend_dist = config.base_dir.parent / "frontend" / "dist"
    if frontend_dist.exists():
        app.router.add_static("/assets", frontend_dist / "assets")
    
    # Fallback: serve web-app public
    web_app_public = config.base_dir.parent / "web-app" / "public"
    if web_app_public.exists():
        app.router.add_static("/public", web_app_public)
    
    return app


def main():
    """Application entry point."""
    # Load and validate config
    config = get_config()
    
    # Setup logging
    setup_logging(config.server.debug)
    
    logging.info("🚀 Starting Python backend server...")
    
    # Validate configuration
    if not validate_config(config):
        sys.exit(1)
    
    logging.info("✅ Volcengine API credentials configured")
    
    # Create and run app
    app = create_app()
    
    logging.info(f"🌐 Server running at http://localhost:{config.server.port}")
    logging.info(f"📡 WebSocket endpoint: ws://localhost:{config.server.port}/ws")
    logging.info("🔊 Using Volcengine AST 2.0 API (Python)")
    
    web.run_app(
        app,
        host=config.server.host,
        port=config.server.port,
        print=None,
    )


if __name__ == "__main__":
    main()
