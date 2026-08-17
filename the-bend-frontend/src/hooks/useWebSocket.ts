import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { sessionManager } from '@/auth/sessionManager';
import { getRuntimeConfig } from '@/platform/runtimeConfig';

type WSMessage = {
  type: 'message' | 'typing' | 'read' | 'notification' | 'error';
  data: Record<string, unknown>;
};

export function buildWebSocketUrl(token: string, runtime = getRuntimeConfig()): string {
  return `${runtime.wsBaseUrl}/api/v1/ws/chat?token=${encodeURIComponent(token)}`;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef<number>();
  const connectRef = useRef<(() => void) | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addMessage = useMessageStore((s) => s.addMessage);

  const connect = useCallback(() => {
    const token = sessionManager.getAccessToken();
    if (!token) return;

    const wsUrl = buildWebSocketUrl(token);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'message') {
          addMessage(msg.data as Parameters<typeof addMessage>[0]);
        }
        // Dispatch custom event for other listeners
        window.dispatchEvent(new CustomEvent('ws-message', { detail: msg }));
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[WS] Disconnected, reconnecting in 3s...');
      reconnectTimeoutRef.current = window.setTimeout(() => connectRef.current?.(), 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [addMessage]);
  connectRef.current = connect;

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [isAuthenticated, connect]);

  const sendMessage = useCallback((threadId: string, content: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'message', thread_id: threadId, content }));
  }, []);

  const sendTyping = useCallback((threadId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'typing', thread_id: threadId }));
  }, []);

  const markRead = useCallback((threadId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'read', thread_id: threadId }));
  }, []);

  return { connected, sendMessage, sendTyping, markRead };
}
