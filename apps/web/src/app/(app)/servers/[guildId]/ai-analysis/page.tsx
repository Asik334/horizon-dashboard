"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { AIAnalysisResult } from "@/types";

function ScoreRing({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? "hsl(var(--success))" : value >= 60 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  return (
    <Card className="flex flex-col items-center gap-2 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-lg font-semibold"
        style={{
          background: `conic-gradient(${color} ${value * 3.6}deg, hsl(240 10% 16%) 0deg)`,
        }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card">{value}</div>
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Card>
  );
}

export default function AIAnalysisPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    api
      .get<{ analysis: AIAnalysisResult | null; stale: boolean }>(`/api/guilds/${guildId}/ai-analysis`)
      .then((r) => {
        setAnalysis(r.analysis);
        setStale(r.stale);
      })
      .catch(() => {});
  }, [guildId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-accent" />
        <h1 className="text-2xl font-semibold">AI Server Analysis</h1>
      </div>

      {!analysis && (
        <Card className="text-center text-muted-foreground">
          Анализ ещё не сгенерирован для этого сервера. Он появится автоматически после накопления
          статистики (см. background job в README — этап 2).
        </Card>
      )}

      {analysis && (
        <>
          {stale && (
            <p className="text-xs text-[hsl(var(--warning))]">
              Данные могли устареть — последний анализ от{" "}
              {new Date(analysis.createdAt).toLocaleString("ru-RU")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <ScoreRing label="Server Health" value={analysis.healthScore} />
            <ScoreRing label="Engagement" value={analysis.engagementScore} />
            <ScoreRing label="Moderation" value={analysis.moderationScore} />
            <ScoreRing label="Activity" value={analysis.activityScore} />
            <ScoreRing label="Growth" value={analysis.growthScore} />
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Рекомендации</h2>
            <ul className="space-y-2">
              {analysis.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
