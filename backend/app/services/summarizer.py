"""
OpenAI API service for meeting summarization.
"""

import os
import logging
import ssl
from typing import Optional
import aiohttp


class SummaryService:
    """Service for calling OpenAI API for meeting summarization."""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = "gpt-4o-mini"  # Fast and cheap
        self.base_url = "https://api.openai.com/v1/chat/completions"
    
    async def summarize_meeting(self, messages: list[dict]) -> Optional[str]:
        """
        Summarize meeting messages using OpenAI API.
        
        Args:
            messages: List of message dicts with sourceText and targetText
            
        Returns:
            Summary string or None if failed
        """
        if not self.api_key:
            logging.error("❌ OPENAI_API_KEY is not set!")
            return None
        
        if not messages:
            return "暂无会议内容可总结。"
        
        # Build conversation content
        conversation = ""
        for i, msg in enumerate(messages, 1):
            source = msg.get("sourceText", "")
            target = msg.get("targetText", "")
            conversation += f"[{i}]\n原文: {source}\n译文: {target}\n\n"
        
        prompt = f"""请对以下会议记录进行智能总结。请用中文回答，包含以下内容：

## 📋 会议概要
简要概述会议的主要内容（2-3句话）

## 🎯 关键要点
- 列出主要讨论的话题和观点（3-5条）

## ✅ 决策和结论
- 列出会议中达成的决定或结论（如有）

## 📝 待办事项
- 列出需要后续跟进的事项（如有）

---
会议记录:
{conversation}
"""
        
        try:
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "你是一个专业的会议记录总结助手。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 2048,
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            
            # Disable SSL verification for macOS compatibility
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(self.base_url, json=payload, headers=headers) as response:
                    if response.status != 200:
                        error = await response.text()
                        logging.error(f"OpenAI API error: {error}")
                        return None
                    
                    result = await response.json()
                    
                    # Extract text from response
                    choices = result.get("choices", [])
                    if choices:
                        message = choices[0].get("message", {})
                        return message.get("content", "")
                    
                    return None
                    
        except Exception as e:
            logging.error(f"OpenAI API error: {e}")
            return None


# Global instance
_summary_service: Optional[SummaryService] = None


def get_summarizer_service() -> SummaryService:
    """Get the global summary service instance."""
    global _summary_service
    if _summary_service is None:
        _summary_service = SummaryService()
    return _summary_service
