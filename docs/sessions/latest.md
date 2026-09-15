# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-15  
**Sessão:** Fechar Epic 0.D + Epic 1 (swaps/segments)

---

## O que foi feito

- **Epic 0.D:** causa do gap de L = DynamicTickArrays omitidos; decoder + gPA dual; fixture offline; L exata; WARN removido
- **Epic 1:** decoder `Traded`, backfill com cursor, `swap_segments`, invariante Σ fee_seg; gate 100% no conjunto indexado

---

## Estado

```
Funcionando:     pool_states + ticks Fixed/Dynamic, L exacta, swaps→segments, gate fee
Em progresso:    soak 30d de mercado (RPC rate limit; usar publicnode/pago)
Bloqueado:       nada crítico
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
```
