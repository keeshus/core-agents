import { useCallback } from 'react';
import type { AssistantMessage } from './AssistantContext';

const STORAGE_KEY = 'copilot:history';
const MAX_MESSAGES_PER_PAGE = 30;
const MAX_TOTAL_CONVERSATIONS = 50;

interface StoredConversation {
  messages: AssistantMessage[];
  updatedAt: number;
}

function readAll(): Record<string, StoredConversation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, StoredConversation>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function useConversationMemory() {
  const save = useCallback((key: string, messages: AssistantMessage[]) => {
    if (!key) return;
    const all = readAll();
    all[key] = { messages: messages.slice(-MAX_MESSAGES_PER_PAGE), updatedAt: Date.now() };

    // Evict oldest conversations if over limit
    const entries = Object.entries(all).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    if (entries.length > MAX_TOTAL_CONVERSATIONS) {
      const pruned: Record<string, StoredConversation> = {};
      for (const [k, v] of entries.slice(-MAX_TOTAL_CONVERSATIONS)) {
        pruned[k] = v;
      }
      writeAll(pruned);
    } else {
      writeAll(all);
    }
  }, []);

  const load = useCallback((key: string): AssistantMessage[] => {
    if (!key) return [];
    const all = readAll();
    return all[key]?.messages || [];
  }, []);

  const clearKey = useCallback((key: string) => {
    const all = readAll();
    delete all[key];
    writeAll(all);
  }, []);

  return { save, load, clearKey };
}
