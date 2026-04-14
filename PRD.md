# LVMON Quota — Product Requirements Document

## 1. Overview

LVMON Quota is a **mindshare incentive system** for the LeverUp / LVMON crypto project. The system monitors and scores user tweets that mention the project on X (Twitter), then distributes daily LVMON quota rewards proportionally based on each user's best tweet score.

**Core value proposition**: Users earn LVMON quota by creating high-quality content about the project. The better the content and the more engagement it receives, the larger their share of the daily reward pool.

---

## 2. System Pipeline

The system operates as a multi-stage pipeline:

```
Tweet Published on X
        |
        v
  [1] Tweet Scan (tweet-ingest)
      - Search X API for mentions
      - Apply hard filters
      - Immediately score content quality via AI
        |
        v
  [2] Observation Window (configurable, default 4h / test 30min)
      - Wait for engagement data to accumulate
        |
        v
  [3] Engagement Scoring (tweet-score)
      - Fetch latest metrics from X API
      - Calculate engagement score
      - Apply trust multiplier
      - Compute final score
      - Re-evaluates ALL unsettled tweets each run (scores grow as engagement accumulates)
        |
        v
  [4] Daily Settlement (daily-settlement)
      - Take each user's best tweet
      - Distribute daily quota pool proportionally
      - Record issuances and ledger entries
        |
        v
  [5] Quota Expiry (quota-expiry)
      - Expire unused quota after 2 weeks
```

---

## 3. Tweet Scanning Rules

### 3.1 Search Query

- **Query**: `@{search_handle} -is:retweet -is:reply`
- **Default handle**: `@LeverUp_xyz` (configurable via admin)
- **Max results per page**: 20 (configurable, range 10-100)
- **Pagination**: Automatically fetches up to 5 pages (max 500 tweets per scan)
- **Incremental scanning**: Uses `since_id` to only fetch tweets newer than the last scan, avoiding duplicate API calls

### 3.2 Hard Filters (Auto-Reject)

A tweet is immediately **rejected** if any of the following are true:

| Rule | Description |
|------|-------------|
| Retweet | `is:retweet` — pure retweets are excluded |
| Reply | `is:reply` — replies are excluded |
| Too short | Text length < **10 characters** (configurable `min_text_length`) |
| No mention | Tweet text does not contain `@{search_handle}` (case-insensitive) |

### 3.3 Duplicate Detection

- **`since_id` incremental fetch**: Each scan saves the newest tweet ID. Next scan uses it as `since_id` so the X API only returns newer tweets.
- **DB unique constraint**: `tweetId` is unique in the database. If a tweet somehow appears twice, the second insert is skipped.
- **Similarity hash**: During engagement scoring, an MD5 hash of normalized tweet text is computed. If the same user has another tweet with the same hash, the duplicate is rejected.

---

## 4. Scoring Rules

### 4.1 Two-Phase Scoring

Scoring is split into two phases for faster user feedback:

| Phase | Trigger | What it scores | User sees |
|-------|---------|---------------|-----------|
| **Phase 1: Quality** | Immediately on scan | Content quality via AI | Quality score visible right away |
| **Phase 2: Engagement** | After observation window | X engagement metrics | Full score updated continuously |

After Phase 1, the tweet's `finalScore` is set to the quality score so it **immediately counts toward mindshare**. After the observation window, Phase 2 begins and the engagement score is calculated. **Engagement is re-evaluated on every subsequent run** — since engagement metrics (likes, retweets, etc.) are cumulative, the score will generally increase over time until the tweet is settled.

### 4.2 Quality Score (0–40 points)

Evaluated by **GPT-4o-mini** with the following dimensions:

| Dimension | Range | Criteria |
|-----------|-------|----------|
| **Relevance** | 0–15 | How relevant to LeverUp, LVMON, or the MON ecosystem. 15 = deeply relevant with specific project knowledge. 0 = completely unrelated. |
| **Originality** | 0–15 | Original content with unique perspective. 15 = highly original analysis/insight. 0 = copy-paste template or generic shill. |
| **Format & Reach** | 0–10 | Rich media formats + author influence (see breakdown below) |

#### Format & Reach Breakdown (0–10):

**Format bonuses:**
| Element | Bonus |
|---------|-------|
| Images/video attachments | +2 |
| Thread/detailed analysis | +2 |
| Data/charts | +1 |
| Product links | +1 |

**Author reach bonuses** (based on followers & verification):
| Condition | Bonus |
|-----------|-------|
| Followers >= 1,000 | +1 |
| Followers >= 10,000 | +2 |
| Followers >= 50,000 OR verified | +3 |
| Followers >= 100,000 AND verified | +4 |

Format score is capped at 10.

**Quality score** = relevance + originality + format (max 40)

### 4.3 Engagement Score (0–60 points)

Calculated after the observation window using latest X metrics:

```
engagement_score = min(60, log_multiplier × ln(1 + weighted_engagement))
```

Where:
```
weighted_engagement = likes × like_weight + replies × reply_weight
                    + retweets × retweet_weight + quotes × quote_weight
```

**Default weights:**

| Metric | Weight | Rationale |
|--------|--------|-----------|
| Like | 1 | Low-effort signal |
| Reply | 2 | Medium engagement |
| Retweet | 3 | High distribution value |
| Quote | 4 | Highest — creates new content |

**Log multiplier**: 12 (default). With this setting, approximately 55 weighted engagement units are needed to reach the 60-point cap.

The logarithmic compression ensures:
- First few interactions are most valuable
- Diminishing returns prevent large accounts from completely dominating
- Small creators with genuine engagement can still score well

### 4.4 Trust Multiplier (0.0–1.0)

Applied to the combined score as an anti-abuse measure:

```
final_score = min(100, trust_multiplier × (quality_score + engagement_score))
```

**Risk scoring rules:**

| Signal | Risk Points | Description |
|--------|-------------|-------------|
| Account age < 14 days | +3 | Very new account |
| Account age < 30 days | +1 | New account |
| Followers < 10 AND tweets > 500 | +2 | Suspicious: many tweets, few followers |
| Followers < 5 | +1 | Very few followers |
| Following/Followers ratio > 10 | +2 | Potential follow-bot |
| User is banned | Instant | multiplier = 0 |

**Risk level mapping:**

| Total Risk Score | Risk Level | Trust Multiplier |
|-----------------|------------|-----------------|
| 0 | none | 1.0 |
| 1 | low | 0.75 |
| 2–3 | low | 0.75 |
| 4+ | medium | 0.5 |
| Banned | high | 0.0 |

### 4.5 Final Score

```
final_score = min(100, trust_multiplier × (quality_score + engagement_score))
```

- **After Phase 1 (quality only)**: `final_score = quality_score` (trust multiplier applied later)
- **After Phase 2 (complete)**: Full formula applied
- **Maximum possible**: 100 points

---

## 5. Daily Reward Distribution

### 5.1 Best Tweet Only

Each user's daily score is determined by their **single best-scoring tweet** of the day.

- `max_tweets_per_user_per_day`: **1** (only the highest-scoring tweet counts)
- Additional tweets are recorded and visible to the user but do not add to their score

### 5.2 Mindshare & Quota Allocation

```
user_mindshare = user_best_score / sum_of_all_best_scores
user_quota = daily_pool × user_mindshare
```

- **Daily quota pool**: 1,000 LVMON (configurable)
- **Distribution method**: Largest Remainder Method — ensures integer allocations sum exactly to the pool total

### 5.3 Settlement Timing

- Settles **yesterday's** scored tweets (Asia/Shanghai timezone)
- Can be re-run to recalculate if needed (deletes and recreates pool data)

---

## 6. Quota Lifecycle

### 6.1 Issuance

- Quota is issued per day, tagged with a **week start** (Monday, Asia/Shanghai timezone)
- Each issuance records: user, pool date, week start, expiry date, amount, source scores

### 6.2 Expiry

- Quota expires at the start of **week N+2** (2 weeks from issuance week)
- Example: Quota issued in week of April 7 expires at the start of April 21
- Expiry is processed by the `quota-expiry` job, which creates ledger entries with negative amounts

### 6.3 Ledger

All quota movements are tracked in a double-entry-style ledger:

| Entry Type | Description |
|-----------|-------------|
| `issue` | Quota awarded from daily settlement |
| `consume` | Quota spent (future feature) |
| `expire` | Quota expired after 2-week window |
| `admin_adjust` | Manual admin adjustment |

Each entry records the `balanceAfter` to enable point-in-time balance lookups.

---

## 7. User System

### 7.1 Authentication

- Login via X (Twitter) OAuth through NextAuth
- Social account linked to internal user record
- Profile data synced: username, name, avatar, followers, following, tweet count, verified status

### 7.2 Wallet Binding

- Logged-in users can bind a wallet address via the **Connect Wallet** button in the header
- Wallet address stored in `User.walletAddress`
- Included in epoch settlement API output for LeverUp backend to process reward distribution
- Users can update their wallet address at any time

### 7.3 Roles & Status

| Role | Permissions |
|------|------------|
| `user` | View leaderboard, own stats, post tweets |
| `admin` | All user permissions + admin dashboard, config, moderation |

| Status | Effect |
|--------|--------|
| `active` | Normal participation |
| `banned` | Trust multiplier = 0, tweets rejected, no rewards |

### 7.4 Unbound Users

- Tweets from users who haven't logged in are still tracked (via `authorXUserId`)
- They appear on the leaderboard with scores
- Quota is calculated but **not written to DB** until the user binds their account

---

## 8. Tweet Status Lifecycle

```
captured → eligible → quality_scored → scored → settled
                 ↘                        ↗
                  rejected ←─────────────┘
```

| Status | Description |
|--------|-------------|
| `captured` | Raw tweet fetched from X API |
| `eligible` | Passed hard filters |
| `quality_scored` | AI quality score completed, awaiting engagement scoring |
| `scored` | Both quality and engagement scores computed |
| `rejected` | Failed filters, duplicate, or manually rejected by admin |
| `settled` | Included in a daily settlement |

---

## 9. Admin Operations

### 9.1 Auto Scheduler

Two independent schedulers with on/off toggle and configurable intervals:

| Scheduler | Default Interval | Function |
|-----------|-----------------|----------|
| Tweet Scan + Quality Score | 15 min | Search X for new tweets, immediately score content quality |
| Engagement Score | 30 min | Score tweets past observation window with engagement data |

- Scheduler state persisted in database, restored on app restart
- UI toggle directly controls actual scheduler state

### 9.2 Manual Triggers

| Job | Description |
|-----|-------------|
| Scan + Quality | Search X API, capture tweets, score quality |
| Engagement Score | Score tweets past observation window |
| Settlement | Distribute daily quota pool |
| Expire Quota | Process expired quota issuances |
| Refresh Profiles | Update X profile data for bound users |

All manual triggers run asynchronously — API returns immediately, UI polls for completion.

### 9.3 Moderation

- **Reject tweet**: Admin can manually reject any tweet with a reason
- **Ban/Unban user**: Toggle user status, affecting trust multiplier
- **Trust override**: Set custom trust multiplier for a user

---

## 10. Epoch Settlement API

### 10.1 Endpoints

Public API for LeverUp backend to pull epoch settlement data:

| Endpoint | Description |
|----------|-------------|
| `GET /api/epoch/current` | Current live epoch (unsettled), real-time scores |
| `GET /api/epoch/latest` | Most recent settled epoch |
| `GET /api/epoch/YYYY-MM-DD` | Specific date's epoch data |

Optional auth: `?key=xxx` (set `EPOCH_API_KEY` env var for production).

### 10.2 Response Format

```json
{
  "epoch": {
    "date": "2026-04-13",
    "status": "settled",
    "poolSize": 1000,
    "totalScore": 6749.94,
    "participantCount": 232
  },
  "participants": [
    {
      "rank": 1,
      "twitter": {
        "username": "example",
        "name": "Example User",
        "userId": "123456",
        "followersCount": 5000,
        "verified": false
      },
      "wallet": "0x1234...abcd",
      "score": {
        "best": 64.64,
        "quality": 30,
        "engagement": 56.19,
        "trust": 0.75
      },
      "mindsharePercent": 0.96,
      "quota": 10
    }
  ]
}
```

### 10.3 Admin Epoch Page

Available at `/admin/epoch`:
- View current, latest, or historical epoch data
- **Export CSV** for spreadsheet processing
- **Copy JSON** for API integration testing

---

## 11. Score Change Logs

Score changes are persisted to the `score_logs` table for observability:

- **First Score**: Logged when a tweet receives its first engagement score
- **Updates**: Logged when engagement re-evaluation causes a score change (delta != 0)
- **Auto-cleanup**: Logs older than 7 days are deleted on each scoring run
- **Admin page**: `/admin/score-logs` with filtering (All / First Score / Updates) and auto-refresh

---

## 12. Configurable Parameters

All parameters are adjustable via the admin Config page without redeployment:

### Search
| Parameter | Default | Description |
|-----------|---------|-------------|
| `search_handle` | `@LeverUp_xyz` | X handle to search for mentions |
| `max_search_results` | 20 | Results per API page (10-100) |

### Scoring
| Parameter | Default | Description |
|-----------|---------|-------------|
| `tweet_observation_window_hours` | 0.5 (test) / 4 (prod) | Hours to wait before engagement scoring |
| `max_tweets_per_user_per_day` | 1 | Best N tweets count toward daily score |
| `tweet_weight_1` | 1.0 | Weight for best tweet |
| `tweet_weight_2` | 0 | Weight for 2nd tweet (disabled) |
| `tweet_weight_3` | 0 | Weight for 3rd tweet (disabled) |

### Anti-Spam
| Parameter | Default | Description |
|-----------|---------|-------------|
| `min_text_length` | 10 | Min characters to pass hard filter |
| `similarity_threshold` | 0.85 | Duplicate detection threshold |

### Engagement Weights
| Parameter | Default | Description |
|-----------|---------|-------------|
| `engagement_like_weight` | 1 | Weight for likes |
| `engagement_reply_weight` | 2 | Weight for replies |
| `engagement_retweet_weight` | 3 | Weight for retweets |
| `engagement_quote_weight` | 4 | Weight for quotes |
| `engagement_log_multiplier` | 12 | Log compression multiplier |

### Quota
| Parameter | Default | Description |
|-----------|---------|-------------|
| `daily_quota_pool` | 1000 | Total LVMON distributed per day |

---

## 13. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes (TypeScript) |
| Database | PostgreSQL + Prisma ORM |
| AI Scoring | OpenAI GPT-4o-mini |
| Social API | Twitter API v2 (twitter-api-v2) |
| Auth | NextAuth v5 (Twitter OAuth) |
| Scheduling | node-cron (in-process) |
| Timezone | Asia/Shanghai (CST) for all date calculations |
