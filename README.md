# Pulerauto

Sistema de descoberta, avaliação e monitoramento de posições em CLMM (EVM + Solana).

**Tese:** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo.

---

## Status

Epic 0 completo (L on-chain Fixed+Dynamic). Epic 1 com pipeline de swaps/`swap_segments` e gate Σ fee no conjunto indexado; soak 30d de mercado pendente de RPC com quota.

- Spec: [`docs/architecture/lp-assistant-spec-v2.md`](docs/architecture/lp-assistant-spec-v2.md)
- Plano: [`docs/architecture/WORKPLAN.md`](docs/architecture/WORKPLAN.md)
- Sessão: [`docs/sessions/latest.md`](docs/sessions/latest.md)

---

## Quick start

```bash
cp .env.example .env
docker compose up -d
./node_modules/.bin/tsx src/scripts/migrate.ts
./node_modules/.bin/vitest run
./node_modules/.bin/tsx src/indexer/run.ts
pnpm swaps:check
```

Backfill de swaps (RPC com menos 429):

```bash
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --max 100 --delay-ms 600
```

> Se `pnpm test` falhar por approve-builds, use `./node_modules/.bin/vitest run`.

---

## Estrutura

```
CLAUDE.md
docs/                 ← contexto para agentes + spec + workplan
migrations/           ← SQL Timescale
fixtures/             ← snapshot ticks offline (L exata)
src/
  math/               ← W, A, LVR, liquidez, fee-capture, swap-segments
  db/                 ← client, migrate, invariantes
  indexer/            ← Whirlpool decode, ticks Fixed/Dynamic, swaps/Traded
  scripts/
```
