# Pulerauto

Sistema de descoberta, avaliação e monitoramento de posições em CLMM (EVM + Solana).

**Tese:** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo.

---

## Status

Epics **0–5** no código (contabilidade + alertas + sinal + backtest scaffolding).  
Soak swaps ≥30d e Epic 5 Done (Reality Check OOS p < 0.05) exigem **RPC archival**.

| Epic | Status |
|------|--------|
| 0 Bootstrap + L on-chain | done |
| 1 Swaps → segments + gate fee | pipeline done; calendário 30d bloqueado sem archival (`pnpm swaps:span`) |
| 2 Positions + P&L | done |
| 3 Watcher / alertas | histerese + dedup + Telegram dry-run; `alerts:dedup-check 7` ok na janela |
| 4 Sinal | EdgeRatio / Markout / regime + `pool_metrics_daily`; `edge_decay` / `markout_negative` wired |
| 5 Backtest + walk-forward | scaffolding done; OOS Done pendente (histórico / archival) |

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
pnpm alerts:ensure-rules
pnpm indexer
pnpm swaps:check
pnpm swaps:span 30
pnpm alerts:dedup-check 7
pnpm metrics:daily --day YYYY-MM-DD
pnpm ranking:weekly
pnpm markout:check
pnpm backtest:run --strategy 1 --pool 1 --days 14 --n-trials 3
pnpm backtest:check --strategy 1
pnpm watcher:once
```

Backfill de swaps (publicnode: ledger ~2d, batch `getTransaction`=1). Para ≥30d use RPC **archival**:

```bash
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --hours 72 --max 400 --delay-ms 150
pnpm swaps:span-bridge --days 2   # cursor separado; exige atingir profundidade
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
migrations/           ← SQL Timescale (001–012: schema → backtest_runs)
fixtures/             ← ticks, posições Orca, P&L sintético, markout
src/
  math/               ← W, A, LVR, fee-capture, swap-segments, position P&L,
                        EdgeRatio, Markout, regime, SigmaImplied,
                        WalkForward, RealityCheck, benchmarks
  db/                 ← client, migrate, invariantes, swap-span, backtest_runs
  indexer/            ← Whirlpool pool/ticks/swaps/Position
  analyzer/           ← position_snapshots + pool_metrics_daily / ranking + BacktestRun
  watcher/            ← alertas (range / data_gap / edge / markout) → Telegram
  scripts/
```
