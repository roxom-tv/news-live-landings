# News Live Landings

Next.js app for Telegram-operated live news landing pages, with live update cycles, admin editing, and Coolify deployment.

## Source Of Truth

The active runtime prompt layer is file-backed:

- Runtime agents: `.claude/agents/*.md`
- Shared skills: `.claude/skills/*.md`

The active LLM runtime loads those files through [src/lib/claude-prompts.ts](src/lib/claude-prompts.ts).

Current active runtime agents:

- `discover`
- `research`
- `writer`
- `designer`
- `critic`
- `liveMonitor`
- `liveUpdater`

Deterministic roles still exist in app code for transport, orchestration, and publishing:

- `telegramGateway`
- `slackGateway`
- `publisher`
- `designStyle`

## Admin

`/admin` and `/landings/admin` now edit the real file-backed prompt surfaces:

- `.claude/agents/*.md` for active runtime agents
- `.claude/skills/*.md` for shared reusable rules

Edits apply to new runs immediately in the running app.

Important:

- Git is the long-term source of truth.
- If production is edited through `/admin`, those same changes should also be committed and pushed to preserve them across rebuilds/redeploys.

## Stack

- Next.js App Router
- SQLite
- OpenAI Responses API
- Telegram webhook
- Slack app integration
- Coolify deployment

## Local Commands

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run dev
```

## Production Shape

The Coolify runtime expects three processes sharing the same environment and persistent data volume:

- `web`
- `orchestrator`
- `worker`

See [COOLIFY_MVP_RUNBOOK.md](COOLIFY_MVP_RUNBOOK.md) for the production setup and operational checklist.
