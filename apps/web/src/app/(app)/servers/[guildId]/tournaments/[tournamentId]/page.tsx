"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useGuildSocket } from "@/hooks/useGuildSocket";
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentStatus,
} from "@/types";
import {
  Trophy,
  Users,
  Radio,
  Ban,
  Play,
  Crown,
  CreditCard,
  CheckCircle2,
} from "lucide-react";

const statusLabels: Record<TournamentStatus, string> = {
  DRAFT: "Черновик",
  REGISTRATION_OPEN: "Регистрация открыта",
  REGISTRATION_CLOSED: "Регистрация закрыта",
  IN_PROGRESS: "Идёт",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export default function TournamentDetailPage() {
  const { guildId, tournamentId } = useParams<{
    guildId: string;
    tournamentId: string;
  }>();

  const searchParams = useSearchParams();
  const { push } = useToast();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [myParticipation, setMyParticipation] =
    useState<TournamentParticipant | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [joining, setJoining] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  /**
   * Загружает публичные данные турнира.
   */
  const load = async () => {
    if (!guildId || !tournamentId) return;

    setLoading(true);
    setError(false);

    try {
      const pub = await api.get<{
        tournament: Tournament;
        myParticipation: TournamentParticipant | null;
      }>(`/api/tournaments/${guildId}/${tournamentId}`);

      setTournament(pub.tournament);
      setMyParticipation(pub.myParticipation);

      /**
       * Проверяем, является ли пользователь администратором.
       * Если нет — просто скрываем админскую панель.
       */
      try {
        await api.get(
          `/api/guilds/${guildId}/tournaments/${tournamentId}`
        );

        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, tournamentId]);

  /**
   * Обработка возврата со Stripe.
   */
  useEffect(() => {
    const payment = searchParams?.get("payment");

    if (payment === "success") {
      push(
        "success",
        "Оплата прошла! Подтверждение придёт в течение нескольких секунд."
      );

      /**
       * После возврата со Stripe сразу обновляем состояние.
       * Webhook может прийти чуть позже, поэтому делаем несколько проверок.
       */
      load();

      const timers = [
        setTimeout(() => load(), 2000),
        setTimeout(() => load(), 5000),
        setTimeout(() => load(), 10000),
      ];

      return () => {
        timers.forEach(clearTimeout);
      };
    }

    if (payment === "cancelled") {
      push(
        "info",
        "Оплата отменена — вы можете попробовать снова в любой момент."
      );

      load();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /**
   * Слушаем события турнира через websocket.
   */
  useGuildSocket(guildId, (msg) => {
    if (
      msg.type === "tournament:participant_confirmed" ||
      msg.type === "tournament:bracket_generated" ||
      msg.type === "tournament:match_result" ||
      msg.type === "tournament:updated" ||
      msg.type === "tournament:cancelled"
    ) {
      load();
    }
  });

  /**
   * Участники по ID.
   */
  const participantsById = useMemo(() => {
    const map = new Map<string, TournamentParticipant>();

    tournament?.participants?.forEach((p) => {
      map.set(p.id, p);
    });

    return map;
  }, [tournament]);

  /**
   * Группируем матчи по раундам.
   */
  const rounds = useMemo(() => {
    const map = new Map<number, TournamentMatch[]>();

    tournament?.matches?.forEach((m) => {
      if (!map.has(m.round)) {
        map.set(m.round, []);
      }

      map.get(m.round)!.push(m);
    });

    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(
        ([round, matches]) =>
          [
            round,
            matches.sort((a, b) => a.position - b.position),
          ] as const
      );
  }, [tournament]);

  /**
   * Регистрация / повторная оплата.
   *
   * ВАЖНО:
   * Для платного турнира backend должен вернуть:
   *
   * {
   *   free: false,
   *   checkoutUrl: "https://checkout.stripe.com/..."
   * }
   *
   * После этого браузер переходит на Stripe.
   */
  const handleJoin = async () => {
    if (!guildId || !tournamentId) {
      push("error", "Не удалось определить турнир");
      return;
    }

    if (joining) return;

    setJoining(true);

    try {
      const res = await api.post<{
        free: boolean;
        checkoutUrl?: string;
        url?: string;
      }>(`/api/tournaments/${guildId}/${tournamentId}/join`);

      /**
       * Бесплатный турнир.
       */
      if (res.free) {
        push("success", "Вы зарегистрированы на турнир!");

        await load();

        return;
      }

      /**
       * Stripe Checkout.
       *
       * Поддерживаем оба варианта:
       * checkoutUrl — основной вариант
       * url — запасной вариант
       */
      const checkoutUrl = res.checkoutUrl ?? res.url;

      if (!checkoutUrl) {
        push(
          "error",
          "Stripe не вернул ссылку на оплату. Проверьте настройки Stripe на сервере."
        );

        return;
      }

      /**
       * Переходим на Stripe Checkout.
       */
      window.location.assign(checkoutUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        push("error", err.message);
      } else {
        push(
          "error",
          "Не удалось создать оплату. Проверьте, что API и Stripe настроены."
        );
      }
    } finally {
      setJoining(false);
    }
  };

  /**
   * Админские действия.
   */
  const runAdmin = async (
    key: string,
    fn: () => Promise<unknown>,
    successMsg: string
  ) => {
    setBusyAction(key);

    try {
      await fn();

      push("success", successMsg);

      await load();
    } catch (err) {
      push(
        "error",
        err instanceof ApiError
          ? err.message
          : "Действие не выполнено"
      );
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * Открытие регистрации.
   */
  const handleOpenRegistration = () => {
    if (!channelId.trim()) {
      push("error", "Укажите ID канала для анонса");
      return;
    }

    runAdmin(
      "open",
      () =>
        api.post(
          `/api/guilds/${guildId}/tournaments/${tournamentId}/open-registration`,
          {
            channelId: channelId.trim(),
          }
        ),
      "Регистрация открыта, анонс отправлен в Discord"
    );
  };

  /**
   * Закрытие регистрации и генерация сетки.
   */
  const handleCloseRegistration = () =>
    runAdmin(
      "close",
      () =>
        api.post(
          `/api/guilds/${guildId}/tournaments/${tournamentId}/close-registration`
        ),
      "Регистрация закрыта, сетка сгенерирована"
    );

  /**
   * Отмена турнира.
   */
  const handleCancel = () => {
    if (
      !confirm(
        "Отменить турнир и вернуть деньги всем оплатившим?"
      )
    ) {
      return;
    }

    runAdmin(
      "cancel",
      () =>
        api.post(
          `/api/guilds/${guildId}/tournaments/${tournamentId}/cancel`
        ),
      "Турнир отменён, возвраты запущены"
    );
  };

  /**
   * Результат матча.
   */
  const handleReportResult = (
    match: TournamentMatch,
    winnerId: string
  ) => {
    runAdmin(
      `match-${match.id}`,
      () =>
        api.post(
          `/api/guilds/${guildId}/tournaments/${tournamentId}/matches/${match.id}/result`,
          {
            winnerId,
          }
        ),
      "Результат зафиксирован"
    );
  };

  /**
   * Loading.
   */
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  /**
   * Ошибка загрузки.
   */
  if (error || !tournament) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          Не удалось загрузить турнир
        </p>

        <button
          onClick={load}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          Повторить
        </button>
      </Card>
    );
  }

  /**
   * Стоимость участия.
   */
  const feeText =
    tournament.entryFeeCents > 0
      ? `${(tournament.entryFeeCents / 100).toFixed(2)} ${tournament.currency.toUpperCase()}`
      : "Бесплатно";

  /**
   * Количество подтверждённых участников.
   */
  const confirmedCount =
    tournament.participants?.filter(
      (p) =>
        p.status === "CONFIRMED" ||
        p.status === "CHECKED_IN"
    ).length ?? 0;

  /**
   * Можно ли зарегистрироваться.
   */
  const canJoin =
    tournament.status === "REGISTRATION_OPEN" &&
    (!myParticipation ||
      (myParticipation.status !== "CONFIRMED" &&
        myParticipation.status !== "CHECKED_IN"));

  /**
   * Ожидание оплаты.
   */
  const pendingPayment =
    myParticipation?.status === "PENDING_PAYMENT";

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-accent" />

            <h1 className="text-2xl font-semibold">
              {tournament.name}
            </h1>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {tournament.game}
          </p>
        </div>

        <span className="rounded-full bg-white/5 px-3 py-1 text-sm font-medium">
          {statusLabels[tournament.status]}
        </span>
      </div>

      {/* Описание */}
      {tournament.description && (
        <Card className="text-sm text-muted-foreground">
          {tournament.description}
        </Card>
      )}

      {/* Основная информация */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs text-muted-foreground">
            Взнос
          </p>

          <p className="mt-1 text-lg font-semibold">
            {feeText}
          </p>
        </Card>

        <Card>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Участники
          </p>

          <p className="mt-1 text-lg font-semibold">
            {confirmedCount}/{tournament.maxParticipants}
          </p>
        </Card>

        {tournament.prizePool && (
          <Card className="col-span-2 md:col-span-2">
            <p className="text-xs text-muted-foreground">
              Призовой фонд
            </p>

            <p className="mt-1 text-sm font-medium">
              {tournament.prizePool}
            </p>
          </Card>
        )}
      </div>

      {/* Регистрация участника */}
      {myParticipation?.status === "CONFIRMED" ||
      myParticipation?.status === "CHECKED_IN" ? (
        <Card className="flex items-center gap-2 text-[hsl(var(--success))]">
          <CheckCircle2 className="h-4 w-4" />

          <span>
            Вы зарегистрированы на этот турнир
          </span>
        </Card>
      ) : pendingPayment ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-accent" />

              <p className="text-sm font-medium">
                Оплата не завершена
              </p>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Нажмите кнопку, чтобы продолжить оплату через Stripe.
            </p>
          </div>

          <button
            type="button"
            onClick={handleJoin}
            disabled={joining}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />

            {joining
              ? "Переходим к оплате..."
              : "Продолжить оплату"}
          </button>
        </Card>
      ) : canJoin ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              Регистрация открыта
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {tournament.entryFeeCents > 0
                ? `Стоимость участия: ${feeText}`
                : "Участие бесплатное"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleJoin}
            disabled={joining}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tournament.entryFeeCents > 0 && (
              <CreditCard className="h-4 w-4" />
            )}

            {joining
              ? tournament.entryFeeCents > 0
                ? "Создание оплаты..."
                : "Регистрация..."
              : tournament.entryFeeCents > 0
                ? `Оплатить ${feeText}`
                : "Зарегистрироваться"}
          </button>
        </Card>
      ) : null}

      {/* Админ-панель */}
      {isAdmin && (
        <Card className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Управление турниром
          </h2>

          <div className="flex flex-wrap gap-3">
            {tournament.status === "DRAFT" && (
              <>
                <input
                  value={channelId}
                  onChange={(e) =>
                    setChannelId(e.target.value)
                  }
                  placeholder="ID канала для анонса"
                  className="rounded-xl border border-border bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent"
                />

                <button
                  type="button"
                  onClick={handleOpenRegistration}
                  disabled={busyAction === "open"}
                  className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                >
                  <Radio className="h-4 w-4" />

                  {busyAction === "open"
                    ? "Открываем..."
                    : "Открыть регистрацию"}
                </button>
              </>
            )}

            {tournament.status === "REGISTRATION_OPEN" && (
              <button
                type="button"
                onClick={handleCloseRegistration}
                disabled={busyAction === "close"}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                <Play className="h-4 w-4" />

                {busyAction === "close"
                  ? "Генерация..."
                  : "Закрыть регистрацию и сгенерировать сетку"}
              </button>
            )}

            {(tournament.status === "REGISTRATION_OPEN" ||
              tournament.status === "IN_PROGRESS") && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={busyAction === "cancel"}
                className="flex items-center gap-2 rounded-xl border border-[hsl(var(--destructive))]/40 px-4 py-2 text-sm font-medium text-[hsl(var(--destructive))] disabled:opacity-50"
              >
                <Ban className="h-4 w-4" />

                {busyAction === "cancel"
                  ? "Отмена..."
                  : "Отменить турнир"}
              </button>
            )}
          </div>

          {/* Участники */}
          {tournament.participants &&
            tournament.participants.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 pr-4">
                        Участник
                      </th>

                      <th className="pb-2 pr-4">
                        Статус
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {tournament.participants.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border/50"
                      >
                        <td className="py-2 pr-4">
                          {p.username}
                        </td>

                        <td className="py-2 pr-4 text-muted-foreground">
                          {p.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}

      {/* Сетка */}
      {rounds.length > 0 && (
        <Card className="overflow-x-auto">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            Сетка
          </h2>

          <div className="flex gap-8">
            {rounds.map(([round, matches]) => (
              <div
                key={round}
                className="flex min-w-[220px] flex-col justify-around gap-4"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  Раунд {round}
                </p>

                {matches.map((m) => {
                  const a = m.participantAId
                    ? participantsById.get(
                        m.participantAId
                      )
                    : null;

                  const b = m.participantBId
                    ? participantsById.get(
                        m.participantBId
                      )
                    : null;

                  return (
                    <div
                      key={m.id}
                      className="rounded-xl border border-border bg-white/5 p-3"
                    >
                      {[
                        {
                          p: a,
                          id: m.participantAId,
                        },
                        {
                          p: b,
                          id: m.participantBId,
                        },
                      ].map((slot, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                            m.winnerId &&
                            m.winnerId === slot.id
                              ? "bg-[hsl(var(--success))]/10 font-medium"
                              : ""
                          }`}
                        >
                          <span className="truncate">
                            {slot.p?.username ??
                              (m.status === "BYE"
                                ? "—"
                                : "TBD")}
                          </span>

                          {isAdmin &&
                            m.status === "READY" &&
                            slot.id && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleReportResult(
                                    m,
                                    slot.id!
                                  )
                                }
                                disabled={
                                  busyAction ===
                                  `match-${m.id}`
                                }
                                className="ml-2 shrink-0 rounded-lg bg-accent/20 px-2 py-0.5 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
                              >
                                {busyAction ===
                                `match-${m.id}`
                                  ? "..."
                                  : "Победа"}
                              </button>
                            )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}