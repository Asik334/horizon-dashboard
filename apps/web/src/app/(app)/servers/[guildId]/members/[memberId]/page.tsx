"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, ShieldAlert, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { discordAvatarUrl } from "@/lib/utils";
import { MemberHistory } from "@/types";

const actionColors: Record<string, string> = {
  WARN: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
  TIMEOUT: "text-orange-400 bg-orange-400/10",
  KICK: "text-orange-500 bg-orange-500/10",
  BAN: "text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10",
  UNBAN: "text-accent bg-accent/10",
  MESSAGE_DELETE: "text-muted-foreground bg-white/5",
  SLOWMODE: "text-muted-foreground bg-white/5",
};

const actionLabels: Record<string, string> = {
  WARN: "Предупреждение",
  TIMEOUT: "Тайм-аут",
  KICK: "Кик",
  BAN: "Бан",
  UNBAN: "Разбан",
  MESSAGE_DELETE: "Удаление сообщения",
  SLOWMODE: "Slowmode",
};

export default function MemberHistoryPage() {
  const { guildId, memberId } = useParams<{ guildId: string; memberId: string }>();
  const router = useRouter();
  const [data, setData] = useState<MemberHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!guildId || !memberId) return;
    setLoading(true);
    setError(null);
    api
      .get<MemberHistory>(`/api/guilds/${guildId}/members/${memberId}/history`)
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить историю участника"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId, memberId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>
        <Card className="text-center text-muted-foreground">
          {error ?? "Участник не найден"}
          <button onClick={load} className="mt-3 block w-full text-sm text-accent hover:underline">
            Повторить
          </button>
        </Card>
      </div>
    );
  }

  const { member, warnings, moderationLogs } = data;
  const activeWarnings = warnings.filter((w) => w.active).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/servers/${guildId}/members`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> К списку участников
      </Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img
            src={discordAvatarUrl(member.discordId, member.avatar, 64)}
            alt={member.username}
            className="h-16 w-16 rounded-full"
          />
          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-wide">
              {member.displayName ?? member.username}
            </h1>
            <p className="text-sm text-muted-foreground">@{member.username}</p>
            {member.roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {member.roles.map((r) => (
                  <span key={r} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            <span className="font-mono text-foreground">{member.messageCount}</span> сообщений
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            <span className="font-mono text-foreground">{activeWarnings}</span> активных варнов
          </div>
          {member.joinedAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              на сервере с {new Date(member.joinedAt).toLocaleDateString("ru-RU")}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Предупреждения</h2>
          <div className="space-y-2">
            {warnings.map((w) => (
              <div key={w.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{w.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(w.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    w.active ? actionColors.WARN : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {w.active ? "Активно" : "Снято"}
                </span>
              </div>
            ))}
            {warnings.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Предупреждений нет</p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">История модерации</h2>
          <div className="space-y-2">
            {moderationLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{log.reason ?? "Без причины"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {log.moderatorName} · {new Date(log.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    actionColors[log.action] ?? "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {actionLabels[log.action] ?? log.action}
                </span>
              </div>
            ))}
            {moderationLogs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Действий модерации не было</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
