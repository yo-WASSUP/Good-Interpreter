"""
REST API routes for sessions and messages.
"""

import json
from aiohttp import web

from ..database import get_database


async def get_sessions(request: web.Request) -> web.Response:
    """Get recent sessions."""
    db = get_database()
    limit = int(request.query.get("limit", 10))
    
    sessions = db.get_recent_sessions(limit)
    
    return web.json_response({
        "sessions": [s.to_dict() for s in sessions]
    })


async def get_session(request: web.Request) -> web.Response:
    """Get a specific session with its messages."""
    db = get_database()
    session_id = request.match_info["session_id"]
    
    session = db.get_session(session_id)
    if not session:
        return web.json_response({"error": "Session not found"}, status=404)
    
    messages = db.get_session_messages(session_id)
    
    return web.json_response({
        "session": session.to_dict(),
        "messages": [m.to_dict() for m in messages]
    })


async def get_active_session(request: web.Request) -> web.Response:
    """Get the current active session with its messages."""
    db = get_database()
    
    session = db.get_active_session()
    if not session:
        return web.json_response({"session": None, "messages": []})
    
    messages = db.get_session_messages(session.session_id)
    
    return web.json_response({
        "session": session.to_dict(),
        "messages": [m.to_dict() for m in messages]
    })


async def update_session_title(request: web.Request) -> web.Response:
    """Update session title."""
    db = get_database()
    session_id = request.match_info["session_id"]
    
    data = await request.json()
    title = data.get("title", "")
    
    session = db.get_session(session_id)
    if not session:
        return web.json_response({"error": "Session not found"}, status=404)
    
    db.update_session(session_id, title=title)
    
    return web.json_response({"success": True})


def setup_api_routes(app: web.Application):
    """Setup REST API routes."""
    app.router.add_get("/api/sessions", get_sessions)
    app.router.add_get("/api/sessions/active", get_active_session)
    app.router.add_get("/api/sessions/{session_id}", get_session)
    app.router.add_patch("/api/sessions/{session_id}", update_session_title)
