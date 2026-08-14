# Horizon Bot — Dashboard

Веб-панель управления для Discord-бота Horizon. Монорепа: Next.js фронтенд + Express API + Discord Gateway бот + PostgreSQL/Prisma.

## Статус

✅ Реализовано и проверено (реальная сборка/typecheck):
- Discord OAuth2, JWT-сессии в httpOnly cookie, отзыв сессий
- Проверка прав на guild (`requireGuildAccess`) — защита от подмены `guildId` в URL, плюс авто-создание строки `Guild` при первом обращении (чтобы записи типа Settings/Warn не падали с ошибкой внешнего ключа до того, как бот успел синхронизировать сервер)
- REST API: guilds, members, member history, settings, moderation (warn/timeout/kick/ban/unban + logs), analytics, ai-analysis, voice, audit logs, surprises
- WebSocket (`/ws`) с авторизацией по cookie и broadcast по гильдиям
- Dashboard UI: Login, Servers, Dashboard, AI Analysis, Moderation, Members, Voice, Analytics, Logs, Settings, Surprises, Member Activity Map — все страницы обрабатывают ошибки загрузки (retry вместо вечного скелетона)
- **`apps/bot`** — реальный Discord Gateway процесс на discord.js, который наполняет БД данными:
  - синхронизирует `Guild` при старте / `guildCreate` / `guildDelete`
  - пишет `GuildMember`, `AuditLog` на join/leave/update ролей
  - считает `messageCount` на `messageCreate` (без чтения текста сообщений — не требует privileged intent `MessageContent`)
  - открывает/закрывает `VoiceSession` на `voiceStateUpdate`, копит `voiceMinutes`
  - раз в 15 минут снапшотит `memberCount`/`onlineCount` в `Analytics` — для графиков на Dashboard/Analytics
  - раз в минуту проверяет и запускает `Surprises` по конфигу, выставленному в Dashboard
- `apps/web` — `next build` проходит полностью, ESLint — 0 ошибок
- `apps/api` и `apps/bot` — `tsc` компилируется без ошибок

⏳ Не реализовано (следующие этапы):
- Background job, который считает AI Analysis (health/engagement/moderation/activity/growth score) на основе накопленных `Analytics`/`ModerationLog` — сейчас эндпоинт просто отдаёт последний снапшот из таблицы `AIAnalysis`, которую пока никто не заполняет
- UI для истории участника (API `getMemberHistory` есть, страницы нет)
- Онлайн-счётчик участников без `Presence Intent` остаётся приблизительным/нулевым — это privileged intent, включается в Discord Developer Portal (см. ниже)

## Архитектура

```
horizon-dashboard/
├── apps/
│   ├── web/     # Next.js 15 dashboard (порт 3000)
│   ├── api/     # Express API + WS (порт 4000) — читает/пишет БД, модерирует через Discord REST (Bot Token)
│   └── bot/     # Discord Gateway процесс — слушает события Discord и наполняет БД
├── packages/
│   └── database/  # Prisma schema + client, общий для api и bot
├── docker-compose.yml   # локальный Postgres
├── railway.api.json     # конфиг Railway-сервиса для API
├── railway.web.json     # конфиг Railway-сервиса для Web
└── railway.bot.json     # конфиг Railway-сервиса для Bot
```

`api` и `bot` — два независимых процесса, общающихся только через общую PostgreSQL (никаких прямых вызовов друг друга). `api` модерирует (ban/kick/timeout) напрямую через Discord REST API своим Bot Token — ему не нужен запущенный `bot`, чтобы кикнуть пользователя. А вот чтобы Members/Voice/Analytics/Logs не были пустыми — `bot` обязателен, это единственный процесс, слушающий реальные события Discord.

## Локальный запуск

```bash
# 1. Поднять Postgres
docker compose up -d

# 2. Установить зависимости (npm workspaces, включая apps/bot)
npm install

# 3. Заполнить .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/bot/.env.example apps/bot/.env
# → DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_BOT_TOKEN — один и тот же
#   бот из Discord Developer Portal, TOKEN дублируется в apps/api/.env и apps/bot/.env
# → JWT_SECRET: openssl rand -base64 48

# 4. Включить privileged intents в Discord Developer Portal → Bot:
#    - Server Members Intent — ОБЯЗАТЕЛЕН (без него guildMemberAdd/Remove не приходят)
#    - Presence Intent — опционально, только для точного Online-счётчика

# 5. Применить схему БД
npm run db:generate
npm run db:migrate

# 6. Запустить все три сервиса (три терминала)
npm run dev:api
npm run dev:bot
npm run dev:web
```

Откройте `http://localhost:3000` → «Войти через Discord». В Discord Developer Portal → OAuth2 → Redirects добавьте `http://localhost:4000/auth/discord/callback`.

## Деплой на Railway

Четыре сервиса из одного репозитория:

1. **Postgres** — плагин Railway.
2. **API** — Root Directory `/`, config `railway.api.json`.
3. **Bot** — Root Directory `/`, config `railway.bot.json`. Переменные — как в `apps/bot/.env.example`, `DATABASE_URL` тот же, что у API. **Не запускает миграции сам** (это делает API при своём старте) — если задеплоить Bot раньше, чем накатится схема, он будет падать и перезапускаться (`restartPolicyMaxRetries: 10`), пока схема не появится, это ожидаемо.
4. **Web** — Root Directory `/`, config `railway.web.json`.

Переменные окружения — см. `.env.example` в каждом из `apps/api`, `apps/web`, `apps/bot`.

⚠️ Если API и Web задеплоены на разных поддоменах `up.railway.app` (а не на одном домене с общим `COOKIE_DOMAIN`) — куки сессии нужно ставить с `sameSite: "none"` (не `"lax"`), иначе браузер не пришлёт cookie в cross-site fetch-запросах и вы будете видеть постоянные 401/редиректы на логин, хотя сам вход в Discord отработает.

## Безопасность — что уже реализовано

- `DISCORD_CLIENT_SECRET` и `DISCORD_BOT_TOKEN` используются только в `apps/api`/`apps/bot`, никогда не попадают во frontend-бандл
- Discord access/refresh токены пользователя хранятся в БД, не в JWT и не в localStorage
- Сессии — httpOnly + secure (в проде) cookie
- `requireGuildAccess` пересчитывает права пользователя на гильдию через Discord API (с TTL-кэшем 60с) при **каждом** запросе к `/api/guilds/:guildId/*` — подмена `guildId` в URL не даёт доступа к чужому серверу
- Rate limiting: общий (120 req/min) + отдельный для модерации (20 req/min)
- Валидация входных данных через zod
- Бот намеренно не запрашивает privileged intent `MessageContent` — считает сообщения, не читая их текст
