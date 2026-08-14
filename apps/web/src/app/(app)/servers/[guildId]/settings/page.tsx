"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Gift } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface GuildSettings {
  language: string;
  timezone: string;
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string | null;
  autoRoleId: string | null;
  antiSpam: boolean;
  antiLink: boolean;
  antiRaid: boolean;
  toxicityDetection: boolean;
  autoModeration: boolean;
  aiAnalysisEnabled: boolean;
  aiModerationEnabled: boolean;
  aiRecommendations: boolean;
  voiceTempChannels: boolean;
  voiceAutoCleanup: boolean;
  voiceDefaultLimit: number;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 px-4 py-3">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn("h-5 w-9 rounded-full transition-colors", checked ? "bg-accent" : "bg-white/10")}
      >
        <span
          className={cn(
            "block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform",
            checked && "translate-x-4"
          )}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { push } = useToast();
  const [settings, setSettings] = useState<GuildSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    if (!guildId) return;
    setLoadError(null);
    api
      .get<{ settings: GuildSettings }>(`/api/guilds/${guildId}/settings`)
      .then((r) => setSettings(r.settings))
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Не удалось загрузить настройки");
      });
  };

  useEffect(load, [guildId]);

  const patch = (partial: Partial<GuildSettings>) => setSettings((s) => (s ? { ...s, ...partial } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.patch(`/api/guilds/${guildId}/settings`, settings);
      push("success", "Настройки сохранены");
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-[hsl(var(--destructive))]">{loadError}</p>
        <button onClick={load} className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-white/5">
          Повторить
        </button>
      </Card>
    );
  }

  if (!settings) return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="flex gap-2">
          <Link
            href={`/servers/${guildId}/surprises`}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-white/5"
          >
            <Gift className="h-4 w-4" /> Surprises
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">General</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={settings.language}
            onChange={(e) => patch({ language: e.target.value })}
            placeholder="Язык (ru/en)"
            className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
          />
          <input
            value={settings.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
            placeholder="Часовой пояс"
            className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Welcome</h2>
        <Toggle checked={settings.welcomeEnabled} onChange={(v) => patch({ welcomeEnabled: v })} label="Включить приветствие" />
        <input
          value={settings.welcomeChannelId ?? ""}
          onChange={(e) => patch({ welcomeChannelId: e.target.value || null })}
          placeholder="ID канала приветствия"
          className="w-full rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
        />
        <textarea
          value={settings.welcomeMessage ?? ""}
          onChange={(e) => patch({ welcomeMessage: e.target.value || null })}
          placeholder="Текст приветствия (можно использовать {user})"
          className="w-full rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
          rows={2}
        />
        <input
          value={settings.autoRoleId ?? ""}
          onChange={(e) => patch({ autoRoleId: e.target.value || null })}
          placeholder="ID авто-роли"
          className="w-full rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Moderation</h2>
        <Toggle checked={settings.antiSpam} onChange={(v) => patch({ antiSpam: v })} label="Anti-spam" />
        <Toggle checked={settings.antiLink} onChange={(v) => patch({ antiLink: v })} label="Anti-link" />
        <Toggle checked={settings.antiRaid} onChange={(v) => patch({ antiRaid: v })} label="Anti-raid" />
        <Toggle checked={settings.toxicityDetection} onChange={(v) => patch({ toxicityDetection: v })} label="Toxicity detection" />
        <Toggle checked={settings.autoModeration} onChange={(v) => patch({ autoModeration: v })} label="Auto moderation" />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">AI</h2>
        <Toggle checked={settings.aiAnalysisEnabled} onChange={(v) => patch({ aiAnalysisEnabled: v })} label="AI анализ сервера" />
        <Toggle checked={settings.aiModerationEnabled} onChange={(v) => patch({ aiModerationEnabled: v })} label="AI модерация" />
        <Toggle checked={settings.aiRecommendations} onChange={(v) => patch({ aiRecommendations: v })} label="AI рекомендации" />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Voice</h2>
        <Toggle checked={settings.voiceTempChannels} onChange={(v) => patch({ voiceTempChannels: v })} label="Временные каналы" />
        <Toggle checked={settings.voiceAutoCleanup} onChange={(v) => patch({ voiceAutoCleanup: v })} label="Автоочистка пустых каналов" />
        <input
          type="number"
          min={0}
          max={99}
          value={settings.voiceDefaultLimit}
          onChange={(e) => patch({ voiceDefaultLimit: Number(e.target.value) })}
          placeholder="Лимит пользователей по умолчанию (0 = без лимита)"
          className="w-full rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
        />
      </Card>
    </div>
  );
}
