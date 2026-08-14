"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ModerationLogEntry, ModerationAction } from "@/types";
import { useGuildSocket } from "@/hooks/useGuildSocket";

const actions: { value: ModerationAction; label: string }[] = [
  { value: "WARN", label: "Warn" },
  { value: "TIMEOUT", label: "Timeout" },
  { value: "KICK", label: "Kick" },
  { value: "BAN", label: "Ban" },
];

const actionColors: Record<string, string> = {
  WARN: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
  TIMEOUT: "text-orange-400 bg-orange-400/10",
  KICK: "text-orange-500 bg-orange-500/10",
  BAN: "text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10",
  UNBAN: "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
};

export default function ModerationPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { push } = useToast();
  const [logs, setLogs] = useState<ModerationLogEntry[]>([]);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<ModerationAction>("WARN");
  const [duration, setDuration] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  const loadLogs = () => {
    if (!guildId) return;
    api
      .get<{ logs: ModerationLogEntry[] }>(`/api/guilds/${guildId}/moderation/logs?pageSize=50`)
      .then((r) => setLogs(r.logs))
      .catch(() => {});
  };

  useEffect(loadLogs, [guildId]);
  useGuildSocket(guildId, (msg) => {
    if (msg.type === "moderation:new") loadLogs();
  });

  const handleSubmit = async () => {
    if (!targetId.trim()) return push("error", "Укажите Discord ID пользователя");
    setSubmitting(true);
    try {
      const endpoint = action.toLowerCase();
      const body: Record<string, unknown> = { targetDiscordId: targetId.trim(), reason: reason || undefined };
      if (action === "TIMEOUT") body.durationMinutes = duration;

      await api.post(`/api/guilds/${guildId}/moderation/${endpoint}`, body);
      push("success", `Действие "${action}" применено`);
      setTargetId("");
      setReason("");
      loadLogs();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Ошибка выполнения действия");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Moderation</h1>

      <Card>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Быстрое действие</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as ModerationAction)}
            className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
          >
            {actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="Discord ID пользователя"
            className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина"
            className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
          />
          {action === "TIMEOUT" ? (
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              placeholder="Минут"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
            />
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {submitting ? "..." : "Выполнить"}
            </button>
          )}
        </div>
        {action === "TIMEOUT" && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {submitting ? "..." : "Выполнить Timeout"}
          </button>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Moderation Logs</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="pb-2 pr-4">User</th>
              <th className="pb-2 pr-4">Action</th>
              <th className="pb-2 pr-4">Moderator</th>
              <th className="pb-2 pr-4">Reason</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-border/50">
                <td className="py-2.5 pr-4">{l.targetUsername}</td>
                <td className="py-2.5 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[l.action] ?? ""}`}>
                    {l.action}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-muted-foreground">{l.moderatorName}</td>
                <td className="py-2.5 pr-4 text-muted-foreground">{l.reason ?? "—"}</td>
                <td className="py-2.5 text-muted-foreground">
                  {new Date(l.createdAt).toLocaleDateString("ru-RU")}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Пока нет записей модерации
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
