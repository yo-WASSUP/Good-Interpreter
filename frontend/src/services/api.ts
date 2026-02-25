/**
 * API service for communicating with the backend.
 */

import type { SubtitleItem } from '../types';

export interface SessionResponse {
    id: number;
    sessionId: string;
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
}

export interface MessageResponse {
    id: number;
    sessionId: string;
    sequence: number;
    sourceText: string;
    targetText: string;
    sourceLanguage: string;
    targetLanguage: string;
    createdAt: string;
}

const API_BASE = '/api';

/**
 * Get recent sessions.
 */
export async function getSessions(limit = 10): Promise<SessionResponse[]> {
    const response = await fetch(`${API_BASE}/sessions?limit=${limit}`);
    if (!response.ok) {
        throw new Error('Failed to fetch sessions');
    }
    const data = await response.json();
    return data.sessions;
}

/**
 * Get the active session with its messages.
 */
export async function getActiveSession(): Promise<{
    session: SessionResponse | null;
    messages: MessageResponse[];
}> {
    const response = await fetch(`${API_BASE}/sessions/active`);
    if (!response.ok) {
        throw new Error('Failed to fetch active session');
    }
    return response.json();
}

/**
 * Get a specific session with its messages.
 */
export async function getSession(sessionId: string): Promise<{
    session: SessionResponse;
    messages: MessageResponse[];
}> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch session');
    }
    return response.json();
}

/**
 * Update session title.
 */
export async function updateSessionTitle(
    sessionId: string,
    title: string
): Promise<void> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        throw new Error('Failed to update session title');
    }
}

/**
 * Convert API messages to SubtitleItems.
 */
export function messagesToSubtitles(messages: MessageResponse[]): SubtitleItem[] {
    return messages.map((msg) => ({
        id: `msg-${msg.id}`,
        timestamp: new Date(msg.createdAt),
        sourceText: msg.sourceText,
        targetText: msg.targetText,
        sourceLanguage: msg.sourceLanguage,
        targetLanguage: msg.targetLanguage,
    }));
}

/**
 * Summarize meeting messages using Gemini AI.
 */
export async function summarizeMeeting(
    messages: Array<{ sourceText: string; targetText: string }>
): Promise<string> {
    const response = await fetch(`${API_BASE}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to summarize meeting');
    }
    const data = await response.json();
    return data.summary;
}

