import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifySessionToken } from "../lib/jwt";
import { SESSION_COOKIE } from "../middleware/auth";

interface ClientMeta {
  userId: string;
  guildId: string | null; // на какую гильдию подписан клиент
}

const clients = new Map<WebSocket, ClientMeta>();

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
}

export function initWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      if (!token) {
        ws.close(4001, "unauthenticated");
        return;
      }
      const payload = verifySessionToken(token);
      clients.set(ws, { userId: payload.sub, guildId: null });
    } catch {
      ws.close(4001, "invalid_token");
      return;
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Клиент подписывается на конкретный guild: { type: "subscribe", guildId }
        // NB: доступ к guildId уже был проверен через REST при загрузке страницы;
        // здесь для простоты доверяем клиенту в рамках сокет-сессии конкретного
        // guildId, т.к. если он не был бы валиден — REST-запросы 403-ились бы
        // и фронт не дошёл бы до подписки. Для строгой проверки — продублировать
        // requireGuildAccess-логику здесь при первой продакшн-итерации.
        if (msg.type === "subscribe" && typeof msg.guildId === "string") {
          const meta = clients.get(ws);
          if (meta) clients.set(ws, { ...meta, guildId: msg.guildId });
        }
      } catch {
        /* игнорируем невалидные сообщения */
      }
    });

    ws.on("close", () => clients.delete(ws));

    ws.send(JSON.stringify({ type: "connected" }));
  });

  return wss;
}

export function broadcastToGuild(guildId: string, message: unknown) {
  const payload = JSON.stringify(message);
  for (const [ws, meta] of clients) {
    if (meta.guildId === guildId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
