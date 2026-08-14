export async function joinTournament(req: AuthedRequest, res: Response) {
  try {
    const { guildId, id } = req.params;
    const user = req.user!;

    const tournament = await prisma.tournament.findFirst({
      where: {
        id,
        guildId,
      },
    });

    if (!tournament) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Турнир не найден",
      });
    }

    if (tournament.status !== "REGISTRATION_OPEN") {
      return res.status(409).json({
        error: "REGISTRATION_CLOSED",
        message: "Регистрация на этот турнир не открыта",
      });
    }

    const existing = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_discordId: {
          tournamentId: id,
          discordId: user.discordId,
        },
      },
      include: {
        payment: true,
      },
    });

    if (
      existing?.status === "CONFIRMED" ||
      existing?.status === "CHECKED_IN"
    ) {
      return res.status(409).json({
        error: "ALREADY_JOINED",
        message: "Вы уже зарегистрированы на этот турнир",
      });
    }

    const confirmedCount = await prisma.tournamentParticipant.count({
      where: {
        tournamentId: id,
        status: {
          in: ["CONFIRMED", "CHECKED_IN"],
        },
      },
    });

    if (confirmedCount >= tournament.maxParticipants) {
      return res.status(409).json({
        error: "TOURNAMENT_FULL",
        message: "Все места заняты",
      });
    }

    // Бесплатный турнир
    if (tournament.entryFeeCents === 0) {
      const participant = await prisma.tournamentParticipant.upsert({
        where: {
          tournamentId_discordId: {
            tournamentId: id,
            discordId: user.discordId,
          },
        },
        create: {
          tournamentId: id,
          discordId: user.discordId,
          username: user.username,
          avatar: user.avatar,
          status: "CONFIRMED",
        },
        update: {
          username: user.username,
          avatar: user.avatar,
          status: "CONFIRMED",
        },
      });

      broadcastToGuild(guildId, {
        type: "tournament:participant_joined",
        payload: participant,
      });

      return res.json({
        free: true,
        participant,
      });
    }

    // Создаём/получаем участника
    const participant = await prisma.tournamentParticipant.upsert({
      where: {
        tournamentId_discordId: {
          tournamentId: id,
          discordId: user.discordId,
        },
      },
      create: {
        tournamentId: id,
        discordId: user.discordId,
        username: user.username,
        avatar: user.avatar,
        status: "PENDING_PAYMENT",
      },
      update: {
        username: user.username,
        avatar: user.avatar,
        status: "PENDING_PAYMENT",
      },
    });

    console.log("[Tournament] Creating Stripe Checkout:", {
      tournamentId: tournament.id,
      participantId: participant.id,
      amountCents: tournament.entryFeeCents,
      currency: tournament.currency,
    });

    const session = await createEntryCheckoutSession({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      guildId,
      participantId: participant.id,
      discordId: user.discordId,
      amountCents: tournament.entryFeeCents,
      currency: tournament.currency,
    });

    console.log("[Tournament] Stripe session created:", {
      id: session.id,
      url: session.url,
    });

    if (!session.url) {
      console.error(
        "[Tournament] Stripe returned empty checkout URL",
        session
      );

      return res.status(500).json({
        error: "STRIPE_CHECKOUT_URL_MISSING",
        message: "Stripe не вернул ссылку на оплату",
      });
    }

    await prisma.payment.upsert({
      where: {
        participantId: participant.id,
      },
      create: {
        tournamentId: tournament.id,
        participantId: participant.id,
        discordId: user.discordId,
        providerSessionId: session.id,
        amountCents: tournament.entryFeeCents,
        currency: tournament.currency,
        status: "PENDING",
      },
      update: {
        providerSessionId: session.id,
        amountCents: tournament.entryFeeCents,
        currency: tournament.currency,
        status: "PENDING",
      },
    });

    return res.status(200).json({
      free: false,
      checkoutUrl: session.url,
      participantId: participant.id,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("[Tournament] joinTournament error:", error);

    if (error?.response) {
      console.error("[Stripe] response:", {
        status: error.response.status,
        data: error.response.data,
      });
    }

    return res.status(500).json({
      error: "CHECKOUT_CREATE_FAILED",
      message:
        process.env.NODE_ENV === "development"
          ? error?.message || "Не удалось создать оплату"
          : "Не удалось создать оплату",
    });
  }
}