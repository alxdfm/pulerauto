# Pulerauto

Sistema de descoberta, avaliação e monitoramento de posições em CLMM (EVM + Solana).

**Tese:** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo.

---

## Status

Epics **0–3** no código (contabilidade + alertas). Próximo: Epic 4 (sinal: edge_ratio / markout).

| Epic | Status |
|------|--------|
| 0 Bootstrap + L on-chain | done |
| 1 Swaps → segments + gate fee | pipeline done; soak calendário 30d em resume (RPC) |
| 2 Positions + P&L | schema/math/ingest/snapshots; ver dívidas no WORKPLAN |
| 3 Watcher / alertas | histerese + dedup + Telegram dry-run; soak 7d pendente |

- Spec: [`docs/architecture/lp-assistant-spec-v2.md`](docs/architecture/lp-assistant-spec-v2.md)
- Plano: [`docs/architecture/WORKPLAN.md`](docs/architecture/WORKPLAN.md)
- Sessão: [`docs/sessions/latest.md`](docs/sessions/latest.md)

---

## Quick start

```bash
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm test
pnpm indexer
pnpm swaps:check
pnpm watcher:once
```

Backfill de swaps (RPC com menos 429; publicnode limita batch `getTransaction`=1):

```bash
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --hours 720 --max 100 --delay-ms 400
```

Positions / P&L:

```bash
pnpm positions:capture-fixture   # mainnet-beta; publicnode bloqueia getProgramAccounts
pnpm positions:index --mint <nft> --wallet <addr>
pnpm positions:snapshot --position <id>
pnpm pnl:check --position <id>
```

Watcher (sem `TELEGRAM_*` → dry-run no log):

```bash
pnpm watcher:once
pnpm watcher   # loop; WATCHER_INTERVAL_MS=30000
```

> Se `pnpm test` falhar por approve-builds, use `./node_modules/.bin/vitest run`.

---

## Estrutura

```
CLAUDE.md
docs/                 ← contexto para agentes + spec + workplan + ADRs
migrations/           ← SQL Timescale (§14–18 + segments/cursors)
fixtures/             ← ticks, posições Orca, P&L sintético
src/
  math/               ← W, A, LVR, fee-capture, swap-segments, position P&L
  db/                 ← client, migrate, invariantes
  indexer/            ← Whirlpool pool/ticks/swaps/Position
  analyzer/           ← position_snapshots / P&L
  watcher/            ← alertas (histerese + dedup) → Telegram
  scripts/
```
