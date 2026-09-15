# Stack & Arquitetura

> Preenchido no setup inicial (2026-09-15). Atualizado com bootstrap Epic 0.

---

## Runtime & Linguagem

```
Linguagem principal:  TypeScript 5.9
Runtime:              Node >= 22 (dev: 24.x)
Package manager:      pnpm 11
```

## Frontend (se aplicável)

```
Framework:      N/A (Fases 0–4; UI depois)
Estilização:    N/A
State:          N/A
```

## Backend (se aplicável)

```
Framework:      processos long-running (indexer, analyzer, watcher, executor);
                API HTTP depois
ORM / DB:       PostgreSQL 16 + TimescaleDB; migrations SQL em migrations/
                client: pg
Auth:           nenhum por ora
```

## Infra & Deploy

```
Hosting:        local (docker compose)
CI/CD:          indefinido
Monitoramento:  nenhum por ora
```

## Blockchain / Web3 (se aplicável)

```
Chain:          Solana mainnet (leitura)
SDK principal:  @solana/web3.js 1.x + decoder manual Whirlpool
Wallet:         N/A
Ambiente:       mainnet (read-only)
Pool piloto:    Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE (Orca SOL/USDC ts=4)
```

---

## Versões fixadas (crítico)

| Pacote | Versão | Motivo de fixar |
|--------|--------|-----------------|
| @solana/web3.js | 1.x | Decoder alinhado ao layout atual; kit v2 depois |

---

## Padrões de arquitetura

```
Padrão geral:     modular monolith por processo
Separação:        math / db / indexer / scripts
Testes:           Vitest (math + invariantes DB)
```

| Processo | Privilegio | Papel |
|----------|------------|--------|
| indexer  | read RPC + write DB | estado de mercado |
| analyzer | read DB + write métricas | LVR, edge, markout (ainda não) |
| watcher  | alerts | ainda não |
| executor | signer isolado | Fase 7 |

---

## O que NÃO usar neste projeto

- Não usar `number`/`float` para estado on-chain, fee growth, L ou P&L canônico
- Não anualizar LVR/fee_APR sem condicionar a tempo em range
- Não tratar swap como pontual em tick_after
- Não pular para execução antes das fases de contabilidade e sinal
