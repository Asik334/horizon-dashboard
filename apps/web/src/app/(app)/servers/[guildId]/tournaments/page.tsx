"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Tournament, TournamentStatus } from "@/types";
import { Trophy, Plus, Users } from "lucide-react";

const statusLabels: Record<TournamentStatus, string> = {
  DRAFT: "Черновик",
  REGISTRATION_OPEN: "Регистрация открыта",
  REGISTRATION_CLOSED: "Регистрация закрыта",
  IN_PROGRESS: "Идёт",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

const statusColors: Record<TournamentStatus, string> = {
  DRAFT: "text-muted-foreground bg-white/5",
  REGISTRATION_OPEN: "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
  REGISTRATION_CLOSED: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
  IN_PROGRESS: "text-accent bg-accent/10",
  COMPLETED: "text-muted-foreground bg-white/5",
  CANCELLED: "text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10",
};

export default function TournamentsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    game: "CS2",
    entryFee: "0",
    currency: "usd",
    maxParticipants: "16",
    prizePool: "",
  });

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    setError(false);
    api
      .get<{ tournaments: Tournament[] }>(`/api/guilds/${guildId}/tournaments`)
      .then((r) => setTournaments(r.tournaments))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  const handleCreate = async () => {
    if (!form.name.trim()) return push("error", "Укажите название турнира");
    const entryFeeCents = Math.round(parseFloat(form.entryFee || "0") * 100);
    if (Number.isNaN(entryFeeCents) || entryFeeCents < 0) return push("error", "Некорректный взнос");
    const maxParticipants = parseInt(form.maxParticipants, 10);
    if (!maxParticipants || maxParticipants < 2) return push("error", "Минимум 2 участника");

    setSubmitting(true);
    try {
      const { tournament } = await api.post<{ tournament: Tournament }>(`/api/guilds/${guildId}/tournaments`, {
        name: form.name.trim(),
        game: form.game.trim() || "CS2",
        entryFeeCents,
        currency: form.currency.trim().toLowerCase() || "usd",
        maxParticipants,
        prizePool: form.prizePool.trim() || undefined,
      });
      push("success", "Турнир создан. Теперь откройте регистрацию на странице турнира.");
      setShowForm(false);
      setForm({ name: "", game: "CS2", entryFee: "0", currency: "usd", maxParticipants: "16", prizePool: "" });
      router.push(`/servers/${guildId}/tournaments/${tournament.id}`);
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Не удалось создать турнир");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tournaments</h1>
          <p className="text-sm text-muted-foreground">Турниры с платным входом (Stripe)</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          <Plus className="h-4 w-4" /> Новый турнир
        </button>
      </div>

      {showForm && (
        <Card>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Создать турнир</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Название турнира"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={form.game}
              onChange={(e) => setForm((f) => ({ ...f, game: e.target.value }))}
              placeholder="Игра (CS2)"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.entryFee}
              onChange={(e) => setForm((f) => ({ ...f, entryFee: e.target.value }))}
              placeholder="Взнос за вход"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
            />
            <input
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              placeholder="Валюта (usd, eur...)"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={2}
              value={form.maxParticipants}
              onChange={(e) => setForm((f) => ({ ...f, maxParticipants: e.target.value }))}
              placeholder="Макс. участников"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm"
            />
            <input
              value={form.prizePool}
              onChange={(e) => setForm((f) => ({ ...f, prizePool: e.target.value }))}
              placeholder="Призовой фонд (текстом, опционально)"
              className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm md:col-span-3"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            0 в поле «Взнос» = бесплатный турнир (участники подтверждаются без Stripe).
          </p>
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {submitting ? "Создаём..." : "Создать"}
          </button>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Не удалось загрузить турниры</p>
          <button onClick={load} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            Повторить
          </button>
        </Card>
      ) : tournaments.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <Trophy className="h-8 w-8" />
          Турниров пока нет — создайте первый
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/servers/${guildId}/tournaments/${t.id}`}>
              <Card className="cursor-pointer space-y-3 transition-transform hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium">{t.name}</h3>
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[t.status]}`}
                  >
                    {t.status === "IN_PROGRESS" && <span className="pulse-dot" aria-hidden="true" />}
                    {statusLabels[t.status]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t.game}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {t._count?.participants ?? 0}/{t.maxParticipants}
                  </span>
                  <span className="font-medium">
                    {t.entryFeeCents > 0 ? `${(t.entryFeeCents / 100).toFixed(2)} ${t.currency.toUpperCase()}` : "Бесплатно"}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
