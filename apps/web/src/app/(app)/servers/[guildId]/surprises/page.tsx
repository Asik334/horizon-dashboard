"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Gift, PartyPopper, Zap, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

type SurpriseType = "RANDOM_REWARD" | "RANDOM_EVENT" | "XP_BOOST" | "ACTIVITY_CHALLENGE";

interface SurpriseConfig {
  id: string;
  type: SurpriseType;
  enabled: boolean;
  probability: number;
  channelId: string | null;
  reward: string | null;
  startHour: number;
  endHour: number;
}

const meta: Record<SurpriseType, { label: string; icon: typeof Gift; emoji: string }> = {
  RANDOM_REWARD: { label: "Random Reward", icon: Gift, emoji: "🎁" },
  RANDOM_EVENT: { label: "Random Event", icon: PartyPopper, emoji: "🎉" },
  XP_BOOST: { label: "XP Boost", icon: Zap, emoji: "⭐" },
  ACTIVITY_CHALLENGE: { label: "Activity Challenge", icon: Flame, emoji: "🔥" },
};

export default function SurprisesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { push } = useToast();
  const [configs, setConfigs] = useState<SurpriseConfig[]>([]);
  const [savingType, setSavingType] = useState<SurpriseType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    if (!guildId) return;
    setLoadError(null);
    api
      .get<{ configs: SurpriseConfig[] }>(`/api/guilds/${guildId}/surprises`)
      .then((r) => setConfigs(r.configs))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Не удалось загрузить конфигурацию"));
  };

  useEffect(load, [guildId]);

  const patch = (type: SurpriseType, partial: Partial<SurpriseConfig>) => {
    setConfigs((cs) => cs.map((c) => (c.type === type ? { ...c, ...partial } : c)));
  };

  const save = async (type: SurpriseType) => {
    const cfg = configs.find((c) => c.type === type);
    if (!cfg) return;
    setSavingType(type);
    try {
      await api.patch(`/api/guilds/${guildId}/surprises/${type}`, {
        enabled: cfg.enabled,
        probability: cfg.probability,
        channelId: cfg.channelId,
        reward: cfg.reward,
        startHour: cfg.startHour,
        endHour: cfg.endHour,
      });
      push("success", `${meta[type].label} обновлён`);
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Surprises</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Horizon Bot может автоматически создавать небольшие события на сервере.
        </p>
      </div>

      {loadError && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-[hsl(var(--destructive))]">{loadError}</span>
          <button onClick={load} className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-white/5">
            Повторить
          </button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {configs.map((cfg) => {
          const m = meta[cfg.type];
          return (
            <Card key={cfg.type} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  <span>{m.emoji}</span> {m.label}
                </span>
                <button
                  onClick={() => patch(cfg.type, { enabled: !cfg.enabled })}
                  className={`h-5 w-9 rounded-full transition-colors ${cfg.enabled ? "bg-accent" : "bg-white/10"}`}
                >
                  <span
                    className={`block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform ${cfg.enabled ? "translate-x-4" : ""}`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">
                  Вероятность (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={cfg.probability}
                    onChange={(e) => patch(cfg.type, { probability: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-border bg-white/5 px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  ID канала
                  <input
                    value={cfg.channelId ?? ""}
                    onChange={(e) => patch(cfg.type, { channelId: e.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-border bg-white/5 px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Час начала окна
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={cfg.startHour}
                    onChange={(e) => patch(cfg.type, { startHour: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-border bg-white/5 px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Час окончания окна
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={cfg.endHour}
                    onChange={(e) => patch(cfg.type, { endHour: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-border bg-white/5 px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">
                Награда / описание
                <input
                  value={cfg.reward ?? ""}
                  onChange={(e) => patch(cfg.type, { reward: e.target.value || null })}
                  placeholder="Например: 500 XP или роль 'Везунчик дня'"
                  className="mt-1 w-full rounded-lg border border-border bg-white/5 px-2 py-1.5 text-sm text-foreground"
                />
              </label>

              <button
                onClick={() => save(cfg.type)}
                disabled={savingType === cfg.type}
                className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {savingType === cfg.type ? "Сохранение..." : "Сохранить"}
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
