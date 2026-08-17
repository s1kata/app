/**
 * Клиент чата поддержки → POST /backend/api/support-chat.php
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSiteBaseUrl } from '../config/apiEndpoints';
import { logger } from '../utils/logger';

const SESSION_KEY = 'th_support_chat_session_v1';

export type SupportChatReply = {
  success: boolean;
  sessionId?: string;
  intent?: string;
  reply?: string;
  handoff?: boolean;
  quickReplies?: string[];
  error?: string;
};

async function getSessionId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    /* ignore */
  }
  const id = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await AsyncStorage.setItem(SESSION_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export async function sendSupportChatMessage(message: string): Promise<SupportChatReply> {
  const base = getSiteBaseUrl();
  if (!base) {
    return { success: false, error: 'no_backend' };
  }
  const sessionId = await getSessionId();
  const url = `${base}/backend/api/support-chat.php`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message: String(message || '').trim(),
        sessionId,
        channel: 'mobile',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as SupportChatReply;
    if (data?.sessionId) {
      try {
        await AsyncStorage.setItem(SESSION_KEY, String(data.sessionId));
      } catch {
        /* ignore */
      }
    }
    if (!res.ok || data.success === false) {
      return {
        success: false,
        error: data.error || `HTTP ${res.status}`,
        sessionId: data.sessionId || sessionId,
        quickReplies: data.quickReplies,
      };
    }
    return {
      success: true,
      sessionId: data.sessionId || sessionId,
      intent: data.intent,
      reply: data.reply,
      handoff: !!data.handoff,
      quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : undefined,
    };
  } catch (e) {
    logger.debug('[SupportChat]', (e as Error)?.message);
    return { success: false, error: (e as Error)?.message || 'network', sessionId };
  }
}

/** Приветствие / быстрые ответы без текста пользователя */
export async function fetchSupportChatGreeting(): Promise<SupportChatReply> {
  return sendSupportChatMessage('');
}
