# LVMON Quota — Development Guide

## Project Overview

Mindshare incentive system for LeverUp/LVMON. Monitors tweets mentioning the project on X, scores them via AI + engagement metrics, and distributes daily LVMON quota rewards.

**Full product spec**: See `PRD.md` for complete rules and formulas.

## Tech Stack

- **Framework**: Next.js 16 (App Router) — full-stack, frontend + API routes in one app
- **Language**: TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **AI**: OpenAI GPT-4o-mini (content quality scoring)
- **Social**: Twitter API v2 (`twitter-api-v2`)
- **Auth**: NextAuth v5 (Twitter OAuth)
- **Scheduling**: `node-cron` (in-process)
- **Styling**: Tailwind CSS 4 (Coinbase-inspired design system)
- **Timezone**: Asia/Shanghai (CST) for all epoch/settlement calculations

## Key Commands

```bash
npm run dev          # Start dev server (port 3001)
npm run build        # Production build
npm run test         # Run tests (uses separate test DB)
npx prisma migrate dev  # Run migrations
npx prisma db push   # Push schema without migration
```

## Architecture

### Pipeline Flow

```
Tweet on X → [Scan] → Hard Filters → [Quality Score via AI] → [Wait observation window]
→ [Engagement Score] → [Daily Settlement] → [Quota Expiry]
```

### Two-Phase Scoring

1. **Phase 1 (Immediate)**: On scan, eligible tweets are quality-scored via GPT-4o-mini. `finalScore = qualityScore` so it immediately counts toward mindshare.
2. **Phase 2 (After observation window)**: Engagement data is fetched and scored. `finalScore = trust × (quality + engagement)`. Engagement is **re-evaluated on every run** — scores grow as engagement accumulates.

### Best Tweet Only

Each user's mindshare is determined by their **single best-scoring tweet**. Other tweets are tracked but don't add to score.

### Epoch Settlement API

`GET /api/epoch/{date|current|latest}` — provides settlement data for LeverUp backend integration. Includes twitter handle, score breakdown, wallet address, LVMON quota amount.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/         # Admin APIs (dashboard, tweets, users, config, scheduler, score-logs)
│   │   ├── cron/          # Job trigger endpoint (async, fire-and-forget)
│   │   ├── epoch/[date]/  # Epoch settlement API for LeverUp backend
│   │   ├── public/        # Public APIs (leaderboard, tweets, creators)
│   │   └── viewer/        # Logged-in user APIs (summary, wallet)
│   ├── admin/             # Admin pages (dashboard, tweets, users, config, score-logs, epoch)
│   ├── creators/[username]/ # Creator profile page
│   └── tweets/            # Main leaderboard page
├── components/            # Shared UI components
├── jobs/                  # Background job logic
│   ├── tweet-ingest.ts    # Scan X + quality score
│   ├── tweet-score.ts     # Engagement score + re-evaluation
│   ├── daily-settlement.ts # Quota distribution
│   ├── quota-expiry.ts    # Expire old quota
│   └── x-profile-refresh.ts # Refresh X profile data
├── lib/                   # Shared libraries
│   ├── config.ts          # Dynamic config from AppConfig table
│   ├── scoring.ts         # Scoring formulas (quality, engagement, trust)
│   ├── quota.ts           # Quota distribution (largest remainder method)
│   ├── scheduler.ts       # Cron scheduler (DB is single source of truth)
│   ├── auth.ts            # NextAuth config
│   └── prisma.ts          # Prisma client
└── instrumentation.ts     # Scheduler init on app startup

prisma/
└── schema.prisma          # Database schema
```

## Conventions

- **PRD sync**: When making functional changes (scoring rules, pipeline flow, config defaults, new features), update `PRD.md` to match.
- **Design system**: Coinbase-inspired. Use custom color tokens (`text-brand`, `bg-surface-card`, `text-accent-green`, etc.) defined in `globals.css`. Buttons use 56px pill radius.
- **Config**: All scoring/filtering parameters are dynamically configurable via `AppConfig` table and admin Config page. Defaults in `config.ts`.
- **Scheduler state**: DB (`AppConfig`) is the single source of truth. In-memory cron tasks are synced from DB on startup and on every state change.
- **Jobs are async**: The `/api/cron` endpoint fires and forgets. Admin UI polls for completion.
- **Score logs**: Score changes are persisted to `score_logs` table (auto-cleaned after 7 days). View at `/admin/score-logs`.
- **Wallet**: Users bind wallet address via header UI. Stored in `User.walletAddress`. Included in epoch API output.

## Environment Variables

```
DATABASE_URL=postgresql://...
X_BEARER_TOKEN=...          # Twitter API bearer token
X_CLIENT_ID=...             # Twitter OAuth client ID
X_CLIENT_SECRET=...         # Twitter OAuth client secret
OPENAI_API_KEY=...          # For GPT-4o-mini scoring
AUTH_SECRET=...              # NextAuth secret
CRON_SECRET=dev-cron-secret # Cron endpoint auth
EPOCH_API_KEY=...           # Optional: auth for epoch settlement API
```
