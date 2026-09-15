# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-15  
**Sessão:** Sync de documentação pós Epic 0.D + Epic 1

---

## O que foi feito

- **Epic 0.D:** DynamicTickArrays; L exata; fixture offline; WARN removido
- **Epic 1:** `Traded` → swaps/`swap_segments`; gate Σ fee no conjunto indexado
- **Docs:** WORKPLAN/OVERVIEW/STACK/CLAUDE/README alinhados; ADR `whirlpool-traded-ingest`; ADR decoder web3 sincronizado

---

## Estado

```
Funcionando:     pool_states + ticks Fixed/Dynamic, L exata, swaps→segments, gate fee
Em progresso:    soak 30d de mercado (RPC rate limit; usar publicnode/pago)
Bloqueado:       nada crítico
Próximo epic:    Epic 2 — positions + P&L
```

---

## Próximos passos

1. Soak `pnpm swaps:backfill --hours 720` em RPC com quota
2. Epic 2: positions + P&L decomposto
3. Indexar `tick_liquidity_events` contínuos (opcional para L histórica)

---

## Comandos

```bash
docker compose up -d
./node_modules/.bin/tsx src/scripts/migrate.ts
./node_modules/.bin/vitest run
./node_modules/.bin/tsx src/indexer/run.ts
./node_modules/.bin/tsx src/scripts/check-invariants.ts
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --max 100 --delay-ms 600
pnpm swaps:check
pnpm ticks:capture-fixture
```
