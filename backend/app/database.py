"""
Database models and utilities for storing translation sessions and messages.
"""

import sqlite3
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass, field, asdict


# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "translations.db"


@dataclass
class TranslationMessage:
    """A single translation message."""
    id: Optional[int] = None
    session_id: str = ""
    sequence: int = 0
    source_text: str = ""
    target_text: str = ""
    source_language: str = "zh"
    target_language: str = "en"
    created_at: str = ""
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "sequence": self.sequence,
            "sourceText": self.source_text,
            "targetText": self.target_text,
            "sourceLanguage": self.source_language,
            "targetLanguage": self.target_language,
            "createdAt": self.created_at,
        }


@dataclass
class MeetingSession:
    """A meeting/translation session."""
    id: Optional[int] = None
    session_id: str = ""
    title: str = ""
    source_language: str = "zh"
    target_language: str = "en"
    created_at: str = ""
    updated_at: str = ""
    is_active: bool = True
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "title": self.title,
            "sourceLanguage": self.source_language,
            "targetLanguage": self.target_language,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "isActive": self.is_active,
        }


class Database:
    """SQLite database manager."""
    
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._ensure_directory()
        self._init_tables()
    
    def _ensure_directory(self):
        """Ensure the database directory exists."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn
    
    def _init_tables(self):
        """Initialize database tables."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            
            # Sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT UNIQUE NOT NULL,
                    title TEXT DEFAULT '',
                    source_language TEXT DEFAULT 'zh',
                    target_language TEXT DEFAULT 'en',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1
                )
            """)
            
            # Messages table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    sequence INTEGER DEFAULT 0,
                    source_text TEXT DEFAULT '',
                    target_text TEXT DEFAULT '',
                    source_language TEXT DEFAULT 'zh',
                    target_language TEXT DEFAULT 'en',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
                )
            """)
            
            # Index for faster queries
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_session 
                ON messages(session_id)
            """)
            
            conn.commit()
            
        finally:
            conn.close()
    
    # Session operations
    def create_session(
        self,
        session_id: str,
        source_language: str = "zh",
        target_language: str = "en",
        title: str = "",
    ) -> MeetingSession:
        """Create a new session."""
        now = datetime.now().isoformat()
        if not title:
            title = f"会议 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sessions (session_id, title, source_language, target_language, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (session_id, title, source_language, target_language, now, now))
            conn.commit()
            
            return MeetingSession(
                id=cursor.lastrowid,
                session_id=session_id,
                title=title,
                source_language=source_language,
                target_language=target_language,
                created_at=now,
                updated_at=now,
            )
        finally:
            conn.close()
    
    def get_session(self, session_id: str) -> Optional[MeetingSession]:
        """Get a session by ID."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            
            if row:
                return MeetingSession(
                    id=row["id"],
                    session_id=row["session_id"],
                    title=row["title"],
                    source_language=row["source_language"],
                    target_language=row["target_language"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    is_active=bool(row["is_active"]),
                )
            return None
        finally:
            conn.close()
    
    def get_recent_sessions(self, limit: int = 10) -> List[MeetingSession]:
        """Get recent sessions."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM sessions 
                ORDER BY updated_at DESC 
                LIMIT ?
            """, (limit,))
            
            sessions = []
            for row in cursor.fetchall():
                sessions.append(MeetingSession(
                    id=row["id"],
                    session_id=row["session_id"],
                    title=row["title"],
                    source_language=row["source_language"],
                    target_language=row["target_language"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    is_active=bool(row["is_active"]),
                ))
            return sessions
        finally:
            conn.close()
    
    def update_session(self, session_id: str, **kwargs):
        """Update session fields."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            
            # Build update query
            updates = ["updated_at = ?"]
            values = [datetime.now().isoformat()]
            
            for key, value in kwargs.items():
                if key in ("title", "is_active"):
                    updates.append(f"{key} = ?")
                    values.append(value)
            
            values.append(session_id)
            
            cursor.execute(f"""
                UPDATE sessions SET {', '.join(updates)}
                WHERE session_id = ?
            """, values)
            conn.commit()
        finally:
            conn.close()
    
    def end_session(self, session_id: str):
        """Mark a session as ended."""
        self.update_session(session_id, is_active=0)
    
    # Message operations
    def add_message(
        self,
        session_id: str,
        source_text: str,
        target_text: str,
        source_language: str = "zh",
        target_language: str = "en",
        sequence: int = 0,
    ) -> TranslationMessage:
        """Add a message to a session."""
        now = datetime.now().isoformat()
        
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO messages (session_id, sequence, source_text, target_text, source_language, target_language, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (session_id, sequence, source_text, target_text, source_language, target_language, now))
            conn.commit()
            
            # Update session timestamp
            cursor.execute("""
                UPDATE sessions SET updated_at = ? WHERE session_id = ?
            """, (now, session_id))
            conn.commit()
            
            return TranslationMessage(
                id=cursor.lastrowid,
                session_id=session_id,
                sequence=sequence,
                source_text=source_text,
                target_text=target_text,
                source_language=source_language,
                target_language=target_language,
                created_at=now,
            )
        finally:
            conn.close()
    
    def get_session_messages(self, session_id: str) -> List[TranslationMessage]:
        """Get all messages for a session."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM messages 
                WHERE session_id = ? 
                ORDER BY created_at ASC
            """, (session_id,))
            
            messages = []
            for row in cursor.fetchall():
                messages.append(TranslationMessage(
                    id=row["id"],
                    session_id=row["session_id"],
                    sequence=row["sequence"],
                    source_text=row["source_text"],
                    target_text=row["target_text"],
                    source_language=row["source_language"],
                    target_language=row["target_language"],
                    created_at=row["created_at"],
                ))
            return messages
        finally:
            conn.close()
    
    def get_active_session(self) -> Optional[MeetingSession]:
        """Get the most recent active session."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM sessions 
                WHERE is_active = 1 
                ORDER BY updated_at DESC 
                LIMIT 1
            """)
            row = cursor.fetchone()
            
            if row:
                return MeetingSession(
                    id=row["id"],
                    session_id=row["session_id"],
                    title=row["title"],
                    source_language=row["source_language"],
                    target_language=row["target_language"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    is_active=True,
                )
            return None
        finally:
            conn.close()


# Global database instance
_db: Optional[Database] = None


def get_database() -> Database:
    """Get the global database instance."""
    global _db
    if _db is None:
        _db = Database()
    return _db
