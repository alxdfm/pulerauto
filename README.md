# Pulerauto

Sistema de descoberta, avaliação e monitoramento de posições em CLMM (EVM + Solana).

**Tese:** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo.

---

## Status

Epics **0–4** no código (contabilidade + alertas + sinal). Próximo: soaks de calendário e Epic 5 (backtest).

| Epic | Status |
|------|--------|
| 0 Bootstrap + L on-chain | done |
| 1 Swaps → segments + gate fee | pipeline done; soak calendário 30d em resume (`pnpm swaps:span`) |
| 2 Positions + P&L | done; dívida de code review fechada |
| 3 Watcher / alertas | histerese + dedup + Telegram dry-run; soak 7d em resume (`pnpm alerts:dedup-check`) |
| 4 Sinal | EdgeRatio / Markout / regime + `pool_metrics_daily`; alertas edge/markout ainda não wired |

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
pnpm swaps:span 30
pnpm alerts:dedup-check 7
pnpm metrics:daily --day YYYY-MM-DD
pnpm ranking:weekly
pnpm markout:check
pnpm watcher:once
```

Backfill de swaps (RPC com menos 429; publicnode limita batch `getTransaction`=1):

```bash
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --hours 720 --max 100 --delay-ms 400
```

Positions / P&L (criação exige `entry_*` — mark live é proibido):

```bash
pnpm positions:capture-fixture   # mainnet-beta; publicnode bloqueia getProgramAccounts
pnpm positions:index --mint <nft> --wallet <addr> \
  --entry-price <p> --entry-amount0 <raw> --entry-amount1 <raw> --entry-value-usd <usd> \
  --opened-at <ISO> --tx-ref <sig>
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
migrations/           ← SQL Timescale (§14–18 + segments/cursors/alerts/metrics)
fixtures/             ← ticks, posições Orca, P&L sintético, markout
src/
  math/               ← W, A, LVR, fee-capture, swap-segments, position P&L,
                        EdgeRatio, Markout, regime, SigmaImplied
  db/                 ← client, migrate, invariantes, swap-span
  indexer/            ← Whirlpool pool/ticks/swaps/Position
  analyzer/           ← position_snapshots + pool_metrics_daily / ranking
  watcher/            ← alertas (histerese + dedup) → Telegram
  scripts/
```
