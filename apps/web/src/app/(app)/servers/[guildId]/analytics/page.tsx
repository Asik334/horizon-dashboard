"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Users,
  MessageSquare,
  Wifi,
  Mic2,
  UserPlus,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { AnalyticsPoint } from "@/types";
import { cn } from "@/lib/utils";

const periods = [
  { value: "24h", label: "24 часа" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
] as const;

type MetricKey = keyof Omit<AnalyticsPoint, "date">;

interface MetricConfig {
  key: MetricKey;
  title: string;
  subtitle: string;
  icon: typeof Users;
  color: string;
  aggregate: "sum" | "last" | "avg";
  format: (v: number) => string;
}

const metrics: MetricConfig[] = [
  {
    key: "memberCount",
    title: "Участники",
    subtitle: "Всего на сервере",
    icon: Users,
    color: "hsl(255 85% 65%)",
    aggregate: "last",
    format: (v) => Math.round(v).toLocaleString("ru-RU"),
  },
  {
    key: "messageCount",
    title: "Сообщения",
    subtitle: "За выбранный период",
    icon: MessageSquare,
    color: "hsl(280 85% 65%)",
    aggregate: "sum",
    format: (v) => Math.round(v).toLocaleString("ru-RU"),
  },
  {
    key: "onlineCount",
    title: "Онлайн",
    subtitle: "Среднее число",
    icon: Wifi,
    color: "hsl(142 70% 45%)",
    aggregate: "avg",
    format: (v) => Math.round(v).toLocaleString("ru-RU"),
  },
  {
    key: "voiceMinutes",
    title: "Голосовая активность",
    subtitle: "Минут суммарно",
    icon: Mic2,
    color: "hsl(38 92% 55%)",
    aggregate: "sum",
    format: (v) => Math.round(v).toLocaleString("ru-RU"),
  },
  {
    key: "newMembers",
    title: "Новые участники",
    subtitle: "Присоединились",
    icon: UserPlus,
    color: "hsl(200 85% 60%)",
    aggregate: "sum",
    format: (v) => `+${Math.round(v).toLocaleString("ru-RU")}`,
  },
  {
    key: "moderationActs",
    title: "Модерация",
    subtitle: "Действий модераторов",
    icon: ShieldAlert,
    color: "hsl(0 72% 58%)",
    aggregate: "sum",
    format: (v) => Math.round(v).toLocaleString("ru-RU"),
  },
];

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function aggregateValue(values: number[], mode: MetricConfig["aggregate"]) {
  if (values.length === 0) return 0;
  if (mode === "sum") return sum(values);
  if (mode === "last") return values[values.length - 1];
  return sum(values) / values.length;
}

// Сравниваем вторую половину периода с первой — простой, но наглядный тренд
// без дополнительного запроса к API за "предыдущий" период.
function trendPct(values: number[]) {
  if (values.length < 2) return 0;
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid || 1);
  const secondHalf = values.slice(mid || 1);
  const a = sum(firstHalf) / firstHalf.length;
  const b = sum(secondHalf) / secondHalf.length;
  if (a === 0) return b === 0 ? 0 : 100;
  return ((b - a) / a) * 100;
}

function TrendBadge({ pct }: { pct: number }) {
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> без изменений
      </span>
    );
  }
  const positive = rounded > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        positive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]"
      )}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {rounded}%
    </span>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
      <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Пока недостаточно данных</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [period, setPeriod] = useState<(typeof periods)[number]["value"]>("7d");
  const [data, setData] = useState<AnalyticsPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    api
      .get<{ data: AnalyticsPoint[] }>(`/api/guilds/${guildId}/analytics?period=${period}`)
      .then((r) => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [guildId, period]);

  const hasData = data.length > 0;

  const summaries = useMemo(
    () =>
      metrics.map((m) => {
        const values = data.map((d) => Number(d[m.key] ?? 0));
        return {
          ...m,
          value: aggregateValue(values, m.aggregate),
          trend: trendPct(values),
        };
      }),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Аналитика</h1>
          <p className="text-sm text-muted-foreground">Активность сервера за выбранный период</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                period === p.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-white/5"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Сводные показатели */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((m) => (
          <Card key={m.key} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{m.title}</span>
              <div
                className="rounded-lg p-2"
                style={{ color: m.color, backgroundColor: `${m.color.replace(")", " / 0.12)")}` }}
              >
                <m.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight">
                {loading ? "—" : m.format(m.value)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{m.subtitle}</span>
              {hasData && !loading && <TrendBadge pct={m.trend} />}
            </div>
          </Card>
        ))}
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {metrics.map((chart) => (
          <Card key={chart.key}>
            <div className="mb-4 flex items-center gap-2">
              <div
                className="rounded-lg p-1.5"
                style={{ color: chart.color, backgroundColor: `${chart.color.replace(")", " / 0.12)")}` }}
              >
                <chart.icon className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-medium">{chart.title}</h2>
            </div>
            {!loading && !hasData ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id={`fill-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chart.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 16%)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                    stroke="hsl(240 6% 60%)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="hsl(240 6% 60%)" fontSize={12} tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    labelFormatter={(d) => new Date(d as string).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}
                    contentStyle={{
                      background: "hsl(240 14% 9%)",
                      border: "1px solid hsl(240 10% 16%)",
                      borderRadius: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={chart.key}
                    stroke={chart.color}
                    strokeWidth={2}
                    fill={`url(#fill-${chart.key})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}