# Linguagem Ubíqua — Glossário do Domínio

> **Esta é a source of truth para todos os nomes usados no projeto.**
> Código, variáveis, funções, tipos, rotas, mensagens de UI e documentação
> devem usar EXATAMENTE os termos definidos aqui. Sem sinônimos.
>
> Quando um novo conceito surgir → adicione aqui ANTES de criar o código.
> Fonte canônica das definições: `docs/architecture/lp-assistant-spec-v2.md`

---

## Como usar este arquivo

O agente deve consultar este glossário:
- Antes de nomear qualquer variável, função, módulo ou tipo
- Antes de criar endpoints ou eventos
- Ao revisar código que usa termos não listados aqui

Se um termo não está aqui e não é óbvio → **pergunte antes de inventar**.

---

## Glossário

### Entidades principais

**Pool** — Mercado CLMM com fee tier, tick spacing e liquidez ativa on-chain.
[Nunca use: market no sentido de pool, pair sozinho quando for o pool]

**Position** — Posição de liquidez concentrada em um range `[tick_lower, tick_upper]` (ticks realizados após mint).
[Nunca use: trade, order, LP share]

**Strategy** — Configuração de política (advisory / dry-run / live) que agrupa posições e regras.
[Nunca use: bot config, policy genérica sem vínculo]

**Swap** — Troca on-chain no pool; decomposta em `swap_segments` quando atravessa ticks.
[Nunca use: trade (ambíguo com posição)]

**SwapSegment** — Trecho de um swap com liquidez constante entre cruzamentos de tick.
[Nunca use: swap leg genérico sem o termo segment]

**Hedge** — Posição de hedge de delta (ex.: short perp) ligada a uma Position/Strategy.
[Nunca use: offset trade]

**Wallet** — Carteira que detém Positions (e eventualmente signer do executor).

---

### Métricas e math

**LVR** — Loss-Versus-Rebalancing: custo irreversível do gamma negativo enquanto em range.
[Nunca use: IL como se fosse taxa de custo contínua]

**LVRRate** — Taxa de LVR **condicional a estar em range** (`σ² · √p / (4 · W)`).
[Nunca use: LVR anualizado no calendário sem tempo em range]

**FeeAPR** — Receita de fee anualizada **condicional a estar em range**, líquida de protocol fee.
[Nunca use: APY de headline do DEX como métrica canônica]

**EdgeRatio** — `σ_implied / σ_realized`; ranking principal do sistema (não APY).
[Nunca use: edge sozinho quando for a razão; score genérico]

**SigmaImplied** — Volatilidade implícita no break-even fee vs LVR; invariante à largura do range.
[Nunca use: implied vol de options sem contexto LP]

**Amplification** (`A`) — Amplificação de capital vs full-range no centro geométrico.
[Nunca use: leverage de LP]

**WidthFactor** (`W`) — Fator de largura: `W(p) ≡ 2√p − √pa − p/√pb`.
[Nunca use: range width em % sem o fator W]

**D2** — Profundidade equivalente-v2: `D₂ ≡ 2 · L_ativa · √p`. Substitui “TVL ativo”.
[Nunca use: TVL ativo, active TVL]

**Markout** — Toxicidade de fluxo; sinal definido sobre `amount0` do pool (spec §7).
[Nunca use: toxicity score ambiguo]

**TimeInRange** — Fração/tempo em que o preço permanece dentro do range da Position.
[Nunca use: uptime genérico]

**BacktestRun** — Execução registrada de simulação histórica (fees, LVR, custos, benchmarks).
[Nunca use: simulation run genérico, paper trade]

**WalkForward** — Partição train/test temporal; só a janela OOS autoriza capital.
[Nunca use: cross-validation sem ordem temporal]

**RealityCheck** — Correção de testes múltiplos: bootstrap do máximo sob H0 com `n_trials` (aproximação White; ver ADR `2026-09-16_epic5-reality-check.md`).
[Nunca use: p-value ingênuo da melhor trial]

**FeeSource** — Origem das fees no BacktestRun: `reconstructed_segments` | `modeled`.
[Nunca use: fee estimate sem declarar a fonte]

---

### Ações / Verbos

**index** — Ingerir estado on-chain (pool states, swaps, tick checkpoints; tick events quando existirem) para o DB.
[Nunca use: sync/scrape como nome de módulo principal]

**analyze** — Calcular métricas derivadas (fees, LVR, edge, markout, P&L).
[Nunca use: compute metrics genérico no nome do processo]

**watch** — Avaliar regras de alerta com histerese e dedup.
[Nunca use: monitor sozinho para o processo]

**rebalance** — Encerrar/abrir Position encadeando P&L na Strategy.
[Nunca use: refresh range sem o termo rebalance]

**execute** — Enviar transação (só após dry-run; processo executor).
[Nunca use: trade/submit como nome do processo]

---

### Estados / Status

**advisory** — Strategy só recomenda; sem execução.
**dry-run** — Simula execução sem signer real / sem envio.
**live** — Execução real com signer isolado.

**inRange** — Preço corrente dentro de `[pa, pb]` da Position.
**outOfRange** — Fora do range: gamma zero, só exposição direcional.

---

### Eventos

**PositionEvent** — Mint, burn, collect, rebalance, etc., na vida da Position.
**Alert** — Disparo deduplicado de uma regra (range exit, edge decay, markout, margin, …).

---

## Mapeamento de código → domínio

| No código | No domínio | Motivo |
|-----------|------------|--------|
| `d2` / `D2` | profundidade equivalente-v2 | coluna/tipo curto; glossário usa D2 |
| `feeGrowthInside` | fee growth inside do range | termo on-chain; shift por DEX (`fee_growth_shift`) |
| `L` / `liquidity` | liquidez ativa / da posição | contexto deixa claro |

---

## Termos BANIDOS neste projeto

| Banido | Use em vez disso | Motivo |
|--------|------------------|--------|
| TVL ativo | D2 | Spec v2: TVL ativo era vago e contraditório |
| IL como custo contínuo | LVR | IL é ponto de trajetória, não taxa |
| APY do DEX (canônico) | FeeAPR + EdgeRatio | Headline APY induz autoengano |
| ±x% aditivo | range multiplicativo | Spec §1 |
| arredondar tick para dentro | ticks realizados; para fora se houver escolha | Spec errata #15 |
