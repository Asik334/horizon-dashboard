"use client";

import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

type MessageHandler = (msg: { type: string; payload?: unknown }) => void;

/**
 * Подключается к /ws, подписывается на события конкретного guildId
 * и вызывает onMessage при каждом входящем событии (moderation:new,
 * member:join, voice:update и т.п.). Переподключается при обрыве связи.
 */
export function useGuildSocket(guildId: string | undefined, onMessage?: MessageHandler) {
  const setIsLive = useAppStore((s) => s.setIsLive);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!guildId) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closedByEffect = false;

    function connect() {
      socket = new WebSocket(wsUrl());

      socket.onopen = () => {
        setIsLive(true);
        socket?.send(JSON.stringify({ type: "subscribe", guildId }));
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handlerRef.current?.(msg);
        } catch {
          /* ignore */
        }
      };

      socket.onclose = () => {
        setIsLive(false);
        if (!closedByEffect) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      socket.onerror = () => socket?.close();
    }

    connect();

    return () => {
      closedByEffect = true;
      clearTimeout(reconnectTimer);
      socket?.close();
      setIsLive(false);
    };
  }, [guildId, setIsLive]);
}
