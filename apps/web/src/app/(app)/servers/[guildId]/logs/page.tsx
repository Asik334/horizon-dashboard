"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

interface AuditLogEntry {
  id: string;
  type: string;
  description: string;
  actorName: string | null;
  createdAt: string;
}

const logTypes = [
  "MEMBER_JOINED",
  "MEMBER_LEFT",
  "MESSAGE_DELETED",
  "WARNING",
  "TIMEOUT",
  "KICK",
  "BAN",
  "ROLE_CHANGED",
  "CHANNEL_CREATED",
  "CHANNEL_DELETED",
  "BOT_ACTION",
];

export default function LogsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    if (!guildId) return;
    const params = new URLSearchParams({ pageSize: "50" });
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    const t = setTimeout(() => {
      api
        .get<{ logs: AuditLogEntry[] }>(`/api/guilds/${guildId}/logs?${params}`)
        .then((r) => setLogs(r.logs))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [guildId, search, type]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Logs</h1>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по описанию..."
            className="w-full rounded-xl border border-border bg-white/5 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
        >
          <option value="">Все типы</option>
          {logTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <Card className="divide-y divide-border/50">
        {logs.map((l) => (
          <div key={l.id} className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0">
            <div>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">{l.type}</span>
              <p className="mt-1">{l.description}</p>
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {new Date(l.createdAt).toLocaleString("ru-RU")}
            </span>
          </div>
        ))}
        {logs.length === 0 && <p className="py-6 text-center text-muted-foreground">Логи не найдены</p>}
      </Card>
    </div>
  );
}
