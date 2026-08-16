"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  ArrowLeft,
  MessageSquare,
  ShieldAlert,
  Calendar,
  Ban,
  Timer,
  UserX,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { api, ApiError } from "@/lib/api";
import { discordAvatarUrl } from "@/lib/utils";
import { MemberHistory, ModerationAction } from "@/types";

const actionMeta: Record<
  ModerationAction,
  { label: string; color: string; hex: string; icon: typeof ShieldAlert }
> = {
  WARN: { label: "Предупреждение", color: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10", hex: "hsl(38 92% 55%)", icon: AlertTriangle },
  TIMEOUT: { label: "Тайм-аут", color: "text-orange-400 bg-orange-400/10", hex: "hsl(24 90% 58%)", icon: Timer },
  KICK: { label: "Кик", color: "text-orange-500 bg-orange-500/10", hex: "hsl(16 90% 55%)", icon: UserX },
  BAN: { label: "Бан", color: "text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10", hex: "hsl(0 82% 62%)", icon: Ban },
  UNBAN: { label: "Разбан", color: "text-accent bg-accent/10", hex: "hsl(154 78% 51%)", icon: UserCheck },
  MESSAGE_DELETE: { label: "Удаление сообщения", color: "text-muted-foreground bg-white/5", hex: "hsl(210 8% 46%)", icon: MessageSquare },
  SLOWMODE: { label: "Slowmode", color: "text-muted-foreground bg-white/5", hex: "hsl(210 8% 46%)", icon: Timer },
};

type TimelineEntry =
  | { kind: "warning"; id: string; createdAt: string; reason: string; active: boolean }
  | { kind: "moderation"; id: string; createdAt: string; reason: string | null; action: ModerationAction; moderatorName: string };

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
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

  const timeline: TimelineEntry[] = useMemo(() => {
    if (!data) return [];
    const w: TimelineEntry[] = data.warnings.map((x) => ({
      kind: "warning",
      id: `w-${x.id}`,
      createdAt: x.createdAt,
      reason: x.reason,
      active: x.active,
    }));
    const m: TimelineEntry[] = data.moderationLogs.map((x) => ({
      kind: "moderation",
      id: `m-${x.id}`,
      createdAt: x.createdAt,
      reason: x.reason,
      action: x.action,
      moderatorName: x.moderatorName,
    }));
    return [...w, ...m].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  const actionBreakdown = useMemo(() => {
    if (!data) return [];
    const counts = new Map<ModerationAction, number>();
    for (const log of data.moderationLogs) counts.set(log.action, (counts.get(log.action) ?? 0) + 1);
    return Array.from(counts.entries()).map(([action, count]) => ({
      action,
      count,
      label: actionMeta[action].label,
      hex: actionMeta[action].hex,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/5" />
        <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-80 animate-pulse rounded-2xl bg-white/5" />
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
  const totalActions = moderationLogs.length;
  const daysSinceJoin = member.joinedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(member.joinedAt).getTime()) / 86_400_000))
    : null;

  const risk =
    activeWarnings >= 3
      ? { label: "Высокий риск", dot: "pulse-dot-danger", text: "text-[hsl(var(--destructive))]" }
      : activeWarnings >= 1
        ? { label: "Есть замечания", dot: "pulse-dot-warning", text: "text-[hsl(var(--warning))]" }
        : { label: "Чисто", dot: "", text: "text-accent" };

  return (
    <motion.div className="space-y-6" initial="hidden" animate="show" variants={container}>
      <motion.div variants={item}>
        <Link
          href={`/servers/${guildId}/members`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> К списку участников
        </Link>
      </motion.div>

      {/* Hero */}
      <motion.div variants={item}>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,hsl(var(--accent)/0.08),transparent_55%)]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={discordAvatarUrl(member.discordId, member.avatar, 64)}
                  alt={member.username}
                  className="h-16 w-16 rounded-full ring-2 ring-accent/30"
                />
                <span
                  className={`pulse-dot absolute -bottom-0.5 -right-0.5 ring-2 ring-[hsl(var(--card))] ${risk.dot}`}
                  title={risk.label}
                />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold uppercase tracking-wide">
                  {member.displayName ?? member.username}
                </h1>
                <p className="text-sm text-muted-foreground">@{member.username}</p>
                <p className={`mt-1 font-mono text-xs font-medium uppercase tracking-wide ${risk.text}`}>
                  ● {risk.label}
                </p>
                {member.roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {member.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Stat row */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Сообщений
          </div>
          <AnimatedNumber value={member.messageCount} className="font-mono text-2xl font-medium" />
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" /> Активных варнов
          </div>
          <AnimatedNumber
            value={activeWarnings}
            className={`font-mono text-2xl font-medium ${activeWarnings > 0 ? "text-[hsl(var(--warning))]" : ""}`}
          />
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Ban className="h-3.5 w-3.5" /> Всего действий
          </div>
          <AnimatedNumber value={totalActions} className="font-mono text-2xl font-medium" />
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" /> На сервере
          </div>
          <span className="font-mono text-2xl font-medium">
            {daysSinceJoin !== null ? <>{daysSinceJoin}д</> : "—"}
          </span>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Timeline */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Хронология</h2>
            {timeline.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Пока ничего не произошло — участник ведёт себя тактически безупречно.
              </p>
            ) : (
              <motion.ol className="relative space-y-0" variants={container} initial="hidden" animate="show">
                {timeline.map((entry, i) => {
                  const isWarning = entry.kind === "warning";
                  const meta = isWarning ? actionMeta.WARN : actionMeta[entry.action];
                  const Icon = meta.icon;
                  const isLast = i === timeline.length - 1;
                  return (
                    <motion.li key={entry.id} variants={item} className="relative flex gap-3 pb-5">
                      {!isLast && (
                        <span className="absolute left-[15px] top-8 h-full w-px bg-border" aria-hidden="true" />
                      )}
                      <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{meta.label}</span>
                          {isWarning && !entry.active && (
                            <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              снято
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {entry.reason ?? "Без причины"}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground/70">
                          {new Date(entry.createdAt).toLocaleString("ru-RU")}
                          {!isWarning && ` · ${entry.moderatorName}`}
                        </p>
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ol>
            )}
          </Card>
        </motion.div>

        {/* Breakdown */}
        <motion.div variants={item}>
          <Card className="flex h-full flex-col">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Действия по типу</h2>
            {actionBreakdown.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">
                Модерация ещё не применялась
              </p>
            ) : (
              <>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={actionBreakdown}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {actionBreakdown.map((entry) => (
                          <Cell key={entry.action} fill={entry.hex} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {actionBreakdown.map((entry) => (
                    <div key={entry.action} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: entry.hex }} />
                        {entry.label}
                      </span>
                      <span className="font-mono">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
