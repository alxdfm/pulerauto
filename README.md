# Pulerauto

Sistema de descoberta, avaliação e monitoramento de posições em CLMM (EVM + Solana).

**Tese:** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo.

---

## Status

Epic 0 em andamento (schema + indexer Orca SOL/USDC). Spec: [`docs/architecture/lp-assistant-spec-v2.md`](docs/architecture/lp-assistant-spec-v2.md). Plano: [`docs/architecture/WORKPLAN.md`](docs/architecture/WORKPLAN.md).

---

## Quick start

```bash
cp .env.example .env
docker compose up -d
./node_modules/.bin/tsx src/scripts/migrate.ts
./node_modules/.bin/vitest run
./node_modules/.bin/tsx src/indexer/run.ts
```

> Se `pnpm test` falhar por approve-builds, use `./node_modules/.bin/vitest run`.

---

## Estrutura

```
CLAUDE.md
docs/                 ← contexto para agentes + spec + workplan
migrations/           ← SQL Timescale
src/
  math/               ← W, A, LVR, liquidez, fee-capture
  db/                 ← client, migrate, invariantes
  indexer/            ← Whirlpool decode + tick arrays + snapshot
  scripts/
```
