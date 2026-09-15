# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-15  
**Sessão:** Epic 0 + início Fase 1 (execução)

---

## O que foi feito

- Bootstrap + indexer Orca + testes
- **Code review fixes:** buffer-codec compartilhado, slot atômico, checkpoint batch+tx,
  catch gPA explícito, fee-capture sem campo morto, Db via `createDb`, `runScript`,
  invariantes fatiados, fee_growth como check real

---

## Estado

```
Funcionando:     DB, math, snapshot pool_states, ticks no DB, testes
Em progresso:    fechar delta L exato; indexar swaps → segments
Bloqueado:       nada crítico
```

---

## Próximos passos

1. Investigar delta L (SDK Orca / fixture de slot único)
2. Indexar swaps do pool + `swap_segments` (Σ fee_seg = fee_amount)
3. Fase 2: positions + P&L

---

## Comandos

```bash
docker compose up -d
./node_modules/.bin/tsx src/scripts/migrate.ts
./node_modules/.bin/vitest run
./node_modules/.bin/tsx src/indexer/run.ts
./node_modules/.bin/tsx src/scripts/check-invariants.ts
```
