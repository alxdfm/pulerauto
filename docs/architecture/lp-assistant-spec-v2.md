# LP Assistant — Especificação Técnica (v2)

Sistema de descoberta, avaliação e monitoramento de posições em CLMM (EVM + Solana).

**Tese central:** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo. Toda decisão do sistema deriva de uma comparação entre os dois, e todo o schema existe para estimar ambos os lados sem autoengano.

> **v2 — o que mudou.** Sinal do markout estava invertido. Exemplo numérico de §3 contradizia a própria regra de TVL ativo. `feeGrowthInside` tinha divisor único para chains com formatos diferentes. Faltavam fee de protocolo, emissões, diluição JIT, AMM de bins (Meteora), tabela de hedges, e decomposição de swaps multi-tick. Schema de liquidez por tick era inviável em volume. Errata completa em §20.

---

## PARTE I — MODELO MATEMÁTICO

Todas as fórmulas desta seção foram verificadas numericamente. Onde um resultado é exato apenas sob condição, a condição está declarada.

### 1. Convenções

`token0` = base (volátil), `token1` = quote. Preço `p` = token1 por token0.

**Range multiplicativo.** Neste documento `±x%` significa `[p/(1+x), p·(1+x)]`, não `[(1−x)p, (1+x)p]`. Convenção multiplicativa é a única coerente com a simetria em log-preço, que é o espaço onde a volatilidade vive. Declare isso na UI — a diferença em ±10% é 9.1% para baixo vs 10% para cima, e usuários assumem o contrário.

**Tick ↔ preço**

```
p(i) = 1.0001^i
i(p) = floor( ln p / ln 1.0001 )
```

| Chain | Campo | Formato | Conversão |
|---|---|---|---|
| EVM (Uniswap v3/v4) | `sqrtPriceX96` | Q64.96 | `p = (sqrtPriceX96 / 2^96)^2` |
| Solana (Orca/Raydium) | `sqrt_price` | Q64.64 | `p = (sqrt_price / 2^64)^2` |
| Meteora DLMM | `active_id` | bin discreto | `p = (1 + bin_step/10^4)^active_id` |

Ajuste de decimais: `p_humano = p_raw × 10^(dec0 − dec1)`.

**Arredondamento de tick.** Posições existem em múltiplos de `tick_spacing`. O erro real não é a direção do arredondamento — é usar os ticks *solicitados* nas métricas em vez dos *realizados*. Sempre recalcule `A`, `W`, break-even e alertas a partir de `tick_lower`/`tick_upper` efetivamente mintados. Quando houver escolha, arredonde para fora (range mais largo): é a direção conservadora, porque estreitar aumenta a probabilidade de saída sem melhorar o break-even (§4).

---

### 2. Primitivas

Liquidez `L` no range `[pa, pb]`, preço corrente `p`:

```
p ≤ pa :  x = L·(1/√pa − 1/√pb)     y = 0
p ≥ pb :  x = 0                      y = L·(√pb − √pa)
pa<p<pb:  x = L·(1/√p − 1/√pb)      y = L·(√p − √pa)
```

**Valor** (em quote), dentro do range:

```
V(p) = x·p + y = L·W(p)        onde   W(p) ≡ 2√p − √pa − p/√pb
```

`W` é o **fator de largura** — aparece em quase tudo abaixo e se cancela nos lugares certos. Vale isolá-lo no código.

**Derivadas**

```
V'(p)  = L·(1/√p − 1/√pb) = x(p)          ← delta = saldo de token0
V''(p) = −L / (2·p^(3/2))                  ← gamma, sempre negativa
```

Fora do range, `V` é linear em `p`: abaixo de `pa`, `V' = L(1/√pa − 1/√pb)` constante e `V'' = 0`; acima de `pb`, `V' = V'' = 0`.

Três consequências que orientam o sistema inteiro:

1. **Delta é o saldo de token0.** Hedge vira leitura de estado, não estimativa (§8).
2. **Gamma existe só dentro do range.** Logo LVR existe só dentro do range. Fora, você tem exposição direcional pura e zero receita — o pior dos dois mundos, e a razão pela qual "tempo fora" é caro mesmo sem perda contábil imediata.
3. **Gamma é sempre negativa.** Não existe LP sem risco; existe prêmio suficiente ou insuficiente.

**Amplificação de capital**

```
A = 1 / ( 1 − (pa/pb)^(1/4) )
```

*Exato quando `p = √(pa·pb)` (centro geométrico); aproximação degrada conforme o preço se afasta do centro.* Verificado: em `p=150`, `r=1.10`, `V_v2/V_v3 = 21.48808848` e a fórmula dá `21.48808848`.

Para range `[p/r, p·r]`: `A = 1/(1 − r^(−1/2))`

| Range | r | A |
|---|---|---|
| ±2% | 1.02 | 101.50 |
| ±5% | 1.05 | 41.49 |
| ±10% | 1.10 | 21.49 |
| ±25% | 1.25 | 9.47 |
| ±50% | 1.50 | 5.45 |

E a identidade útil: `W = 2√p / A` no centro geométrico.

---

### 3. LVR

IL clássico responde "quanto perdi vs HODL neste ponto" — é um ponto de trajetória, some se o preço volta, e não é uma taxa de custo. O custo irreversível é o que o arbitrador extrai continuamente: **LVR** (Milionis–Moallemi–Roughgarden–Zhang, 2022).

```
ℓ(p) = (σ² · p² / 2) · |V''(p)|  =  σ² · L · √p / 4
```

**Taxa relativa ao capital, anualizada, condicional a estar em range:**

```
                 σ²        √p            σ²      √p
LVR_rate  =     ──── · ──────────  =    ──── · ────
                  4        W              4      W
```

Casos-limite (ambos verificados numericamente):

- **Full range (v2):** `W = 2√p` → `LVR_rate = σ²/8` ✓ (reproduz o resultado canônico)
- **Centro geométrico:** `LVR_rate = (σ²/8)·A` — **exato**, não aproximado. Verificado: σ=0.80, r=1.10 → ambos os caminhos dão `1.71904708`.

> `σ` é a volatilidade anualizada **do ratio token0/token1**, não a de cada token. Para LST/SOL ou stable/stable esse número é 1–2 ordens de grandeza menor que a vol dos componentes. É aí que está o edge estrutural (§9).

**Condicionalidade — correção importante da v1.** `LVR_rate` é uma taxa *em range*. A perda esperada no período é:

```
E[LVR_período] = LVR_rate × V × (tempo em range)
```

Não anualize `LVR_rate` contra o calendário inteiro. Pela mesma razão, `fee_APR` também é condicional a estar em range, e é isso que torna os dois comparáveis diretamente. Fora do range o P&L é puramente direcional e entra na conta como `V(p) − V_hodl(p)`, não como LVR.

---

### 4. Break-even e volatilidade implícita — o resultado central

Defina a **profundidade equivalente-v2** do pool, calculável exatamente do estado on-chain:

```
D₂ ≡ 2 · L_ativa · √p
```

É o valor que a liquidez ativa teria se estivesse espalhada em range infinito. Substitui o conceito vago de "TVL ativo" da v1 por algo que se lê direto de `pool_states.liquidity` e `sqrt_price`.

Sua receita de fee, líquida da fee de protocolo:

```
fee_rate_LP = feeTier × (1 − protocol_fee_share)

              fee_rate_LP × Vol_anual_em_range
fee_APR  =  ────────────────────────────────────  =  A · fee_rate_LP · Vol/D₂
                  L_ativa · W
```

(independente do seu tamanho — bom; escala com `A` — esperado.)

Impondo `fee_APR > LVR_rate` e substituindo:

```
fee_rate_LP · Vol/(L_ativa · W)  >  (σ²/4)·√p/W
```

**`W` cancela.** A largura do range desaparece da desigualdade. Resolvendo:

```
σ_implícita = sqrt( 8 · fee_rate_LP · Vol_anual / D₂ )
```

Verificado numericamente em `r ∈ {1.02, 1.05, 1.10, 1.25, 1.50}`: `fee_APR` varia de 1976% a 106%, e `σ_implícita` permanece **1.2479 em todos os casos**.

**Isso corrige e endurece a afirmação da v1.** Estreitar o range multiplica fee e LVR pelo mesmo `A` e não move o break-even nem um ponto. `σ_implícita` é uma propriedade do *pool* — fee tier, volume e profundidade — não da sua posição.

O que a largura de fato controla é de segunda ordem, e é o que a otimização deve atacar:

| Efeito da largura | Direção |
|---|---|
| Fração do volume que executa dentro do range | ↓ ao estreitar |
| Tempo em range | ↓ ao estreitar |
| Frequência e custo de rebalance | ↑ ao estreitar |
| Exposição a diluição por JIT | ↑ ao estreitar |
| Razão fee/LVR | **invariante** |

**Regra de decisão primária:** entre apenas se `σ_realizada < σ_implícita` com margem (sugestão: razão ≥ 1.3 para cobrir erro de estimativa de σ e diluição).

**Exemplo validado**

```
SOL/USDC · fee LP 16bps · volume 40M/dia · D₂ = 120M
σ_impl = sqrt(8 × 0.0016 × 14.6e9 / 120e6) = 1.2479  → 125% a.a.
σ_real(30d, do ratio) = 75%
edge_ratio = 1.66  → entra

Em ±10% (A = 21.49):  fee_APR = 418%  e  E[τ] ≈ 5.2 dias (§6)
```

**Emissões.** Vários pools só fecham a conta com incentivos. Trate à parte, nunca somado cru:

```
reward_APR_efetivo = reward_APR × (1 − haircut)
haircut = desconto por lockup, vesting, e pressão de venda do token emitido
```

Regra: uma estratégia que só é lucrativa com `reward_APR` não é uma estratégia de LP — é uma posição direcional no token emitido, e deve ser marcada assim na UI. Rank primário sempre por `edge_ratio` de fee pura; emissões entram como desempate.

---

### 5. Fee capture real

O que você de fato recebe:

```
fees = fee_rate_LP × Σ_segmentos [ vol_seg × L_você / L_ativa(seg) ]
       para segmentos cujo intervalo de tick intersecta [i_a, i_b)
```

**Correção da v1:** um swap não executa em "um tick". Ele consome liquidez ao longo de um caminho de ticks, com `L_ativa` mudando a cada cruzamento. Para precisão é preciso **decompor cada swap em segmentos por intervalo de tick** e acumular por segmento. Tratar o swap como pontual no `tick_after` enviesa a favor de quem está do lado para onde o preço andou.

Reconstrução de `L_ativa(i,t)`:

```
L_ativa(i, t) = L_checkpoint(t₀) + Σ_{eventos em (t₀,t]} Δ + Σ_{j ≤ i} net_liquidity(j)
```

Simular volume e assumir participação proporcional ao TVL superestima fee sistematicamente, e o viés cresce ao estreitar — que é justamente onde a competição e o JIT se concentram.

**Diluição JIT.** Em EVM, bots adicionam liquidez no mesmo bloco de um swap grande e removem em seguida, capturando fee sem assumir risco. Efeito: seu `L_você/L_ativa` real no instante dos swaps grandes é menor que o média. Meça o fator diretamente:

```
jit_factor = fees_realizadas / fees_previstas_por_L_média     (esperado < 1)
```

Aplique como multiplicador em `E[fees]` no backtest. Em Solana o efeito é menor (sem mempool pública do mesmo tipo), mas não é zero.

**Fees pendentes — divisor depende da chain.** A v1 dava um único `2^128`:

```
EVM (Uniswap v3/v4):   fees_i = L × (feeGrowthInside_i,atual − feeGrowthInside_i,last) / 2^128
Orca Whirlpool:        fees_i = L × (fee_growth_inside_i,atual − ..._last) / 2^64
Raydium CLMM:          Q64.64 → 2^64
```

`feeGrowthInside = global − below − above`, em aritmética **wrapping** (u256 em EVM, u128 em Solana). Subtração com wrap é o comportamento correto, não um bug a ser "protegido" com clamp. Nunca em float.

**Escolha de fee tier.** Para o mesmo par existem várias faixas. Tier maior rende mais por unidade de volume mas captura menos volume. Como `σ_implícita ∝ sqrt(fee_rate × Vol)`, compare tiers diretamente por `σ_implícita` — o produto é o que importa, e frequentemente o tier menor vence.

---

### 6. Tempo em range

Em log-preço `X = ln(p/p₀)`, barreiras simétricas `±h` com `h = ln(r)`, sem drift em log:

```
E[τ] = h² / σ²
```

Verificado: `r=1.10 → h=0.0953`, `σ=0.80` → `E[τ] = 0.01419 ano = 5.18 dias`.

**Ressalva da v1.** Se o *preço* é martingale, o log tem drift `−σ²/2`, o que enviesa a saída para baixo e torna ranges simétricos em log assimétricos em risco. Para `σ=80%`, o drift em log é −32% a.a. — nada desprezível. Use barreiras assimétricas ou corrija o centro.

**Regra de entrada** (substitui a heurística arbitrária da v1 de "E[τ] > 2× intervalo"):

```
fee_APR × V × E[τ]  >  κ × custo_rebalance_total
```

com `κ ≥ 3` de margem. Custo total = gas + swap fee + slippage + spread de reentrada.

```
Exemplo: V=$10k, fee_APR=4.18, E[τ]=0.0142 → fees esperadas ≈ $594
Custo de rebalance em Solana ≈ $10–30  →  razão ≈ 20–60x  → viável
Mesma posição em L1 Ethereum a $80/rebalance → razão ≈ 7x → viável, mas margem menor
Reduza V para $1k em Ethereum → razão ≈ 0.7x → inviável
```

**Para alocação de capital, não use GBM.** Rode Monte Carlo com *block bootstrap* dos retornos do par (blocos de 12–48h, ≥ 2000 caminhos). Preserva caudas gordas e clustering de volatilidade — exatamente o regime em que o range quebra e em que GBM mais engana.

---

### 7. Toxicidade de fluxo — markout

**Correção de sinal (bug da v1).** A definição anterior produzia valor positivo quando o LP perdia. A forma correta, ancorada diretamente no campo `swaps.amount0` com a convenção do evento (positivo = o pool *recebeu* token0):

```
markout_LP(Δt) = Σ_s  amount0_s × ( p(t_s + Δt) − p_exec,s )
```

Sanidade: o pool comprou token0 a 100 (`amount0 > 0`) e o preço vai a 105 → produto positivo → o LP ganhou. ✓
O pool vendeu token0 a 100 (`amount0 < 0`) e o preço vai a 105 → produto negativo → vendeu barato, LP perdeu. ✓

Medir em Δt ∈ {1min, 5min, 30min}.

- `markout_LP < 0` persistente → fluxo tóxico, adverse selection, LVR realizada acima da teórica
- `markout_LP ≈ 0` → fluxo balanceado (retail, round-trip). É o alvo.

Normalize por volume para comparar pools: `markout_bps = markout_LP / volume × 10^4`.

Proxies baratos para screening antes de indexar swaps:

```
efficiency_ratio = |p_fim − p_início| / Σ|Δp_i|       (baixo = round-trip = bom)
routed_ratio     = volume_via_agregador / volume_total
top_sender_pct   = volume do maior sender / total      (alto = bot único ou wash)
```

---

### 8. Delta hedge

Como `V' = x(p)`, o delta em token0 é o saldo de token0:

```
p < pa  :  Δ = L·(1/√pa − 1/√pb)      (máximo, 100% token0)
pa≤p≤pb :  Δ = L·(1/√p  − 1/√pb)
p > pb  :  Δ = 0
```

Short de perp de tamanho `Δ` neutraliza o direcional. Delta varia continuamente (gamma negativa) → rehedge discreto e com custo.

**Banda de rehedge.** A v1 citou uma fórmula fechada com expoentes imprecisos. O que é sólido é a *lei de escala* de Whalley–Wilmott:

```
banda ∝ ( custo_proporcional × p × Γ² / γ )^(1/3)
```

`γ` (aversão a risco) não é observável e precisa de calibração arbitrária, o que fragiliza o resultado. **Use a lei de escala para entender a sensibilidade** — banda cresce com o custo e cai com aversão, ambos na potência 1/3, portanto pouco sensível — **e opere com a regra empírica:**

```
rehedge quando |Δ_atual − Δ_hedgeado| / Δ_atual > θ,   θ ∈ [0.15, 0.30]
```

Calibre θ por backtest com custo real, não por fórmula.

**Funding — correção de sinal conceitual da v1.** Estar short perp com funding positivo significa **receber** carry (longs pagam shorts). Em regime de alta, o hedge se autofinancia e o LP hedgeado fica estruturalmente atraente. Funding negativo persistente é que vira custo. Modele com sinal explícito:

```
custo_hedge = −funding_recebido + taker_fee × turnover_hedge + slippage + custo_de_margem
```

**Risco que o hedge introduz:** liquidação da perna short se o colateral for insuficiente, justamente no cenário em que a perna LP está 100% em token0. Exija margem dimensionada para `+3σ` em 7 dias e alerta de margem como severidade `critical`.

---

### 9. Onde está o edge, em ordem de retorno ajustado a risco

1. **Pares de mesmo ativo / alta correlação.** LST/SOL, stable/stable, wrappeds. `σ` do ratio é minúscula → `σ_implícita/σ_real` alto com range ultra-estreito. Ressalva: LST tem drift monotônico (o staking rate acumula), então o range deve ser assimétrico para cima — `range_skew` no schema existe para isso. Risco residual real: depeg, que é de cauda e não aparece em `σ`. Trate com limite de exposição, não com range.
2. **Filtro de markout.** Mesmo volume/TVL, economia oposta. É a métrica de seleção mais discriminante do sistema.
3. **Fee dinâmica em vol alta.** DLMM ajusta fee com volatilidade, compensando parte da LVR. Estruturalmente superior a fee fixa em regime volátil; inferior em regime calmo.
4. **Janela de prêmio.** Pool novo com `σ_implícita` alta antes de a liquidez chegar. Detecta por `dD₂/dt` baixa enquanto `dVol/dt` dispara. Janela de horas. Exige o filtro de token de §17 — fee APR alto em token novo é quase sempre prêmio de risco de rug, não ineficiência.
5. **LP hedgeado com funding positivo.** Fee + carry de funding, direcional neutro. Só com os controles de margem acima.

---

### 10. AMM de bins (Meteora DLMM) — omissão da v1

A v1 declarava suporte a `clmm_bin` no schema mas dava apenas matemática de tick. Bins são **constante-soma dentro do bin**, o que muda a estrutura:

```
Dentro do bin i:  V(p) = x·p + y  com p fixo em p_i   →  V'' = 0
```

Gamma não é contínua: é uma soma de massas de Dirac nas fronteiras de bin. LVR não integra — **soma por cruzamento**:

```
LVR_bin = Σ_cruzamentos  R_i × |p_i − p_externo(t)|
```

onde `R_i` é o inventário do bin virado no cruzamento.

**Regra prática validada pela estrutura:** com liquidez espalhada em ≥ 20 bins, a discretização é fina o bastante e a fórmula contínua de §3 aproxima bem (erro de ordem `bin_step`). Com < 5 bins, a fórmula contínua **subestima** a perda e é preciso somar por cruzamento. O sistema deve escolher o estimador por `n_bins`, não por DEX.

Fee dinâmica: `fee_rate_LP` não é constante. Capture `swaps.fee_amount` efetivo por swap em vez de multiplicar por um tier nominal — o schema já prevê o campo, e para DLMM ele é obrigatório, não opcional.

---

### 11. Regime

**Efficiency Ratio (Kaufman):**

```
ER(n) = |p_t − p_{t−n}| / Σ |p_i − p_{i−1}|
```

Os limiares `0.4 / 0.2` da v1 não são universais — dependem de `n`, do timeframe da amostragem e do par. **Calibre por par** contra o quantil histórico: use `ER > Q₈₀(ER, 90d)` como sinal de tendência. Guarde o quantil, não a constante.

**Variance Ratio** para confirmação: `VR(q) = Var(r_q)/(q·Var(r_1))`, com significância por Lo–MacKinlay heterocedástico-robusto (a versão homocedástica rejeita demais em cripto).

**Uso:** em regime trending, **feche** — não reposicione. Reposicionar em tendência é comprar o topo repetidamente e cristalizar perda a cada rebalance. É o modo de falha mais caro de LP automatizado, e é exatamente o que "Threshold 5%" faz.

---

### 12. Objetivo, validação estatística e overfit

```
maximize   E[fees]·jit_factor − E[LVR] − custos_rebalance − gas − custo_hedge
sujeito a  CVaR₉₅(PnL − PnL_hodl) ≥ −limite
           margem_hedge ≥ exposição a +3σ/7d
```

**Não use Sharpe.** O retorno de LP é assimétrico por construção — short gamma gera muitos ganhos pequenos e perdas raras e grandes. Sharpe alto é o comportamento *esperado* de quem acumula prêmio; ele não separa "lucrativa" de "ainda não explodiu". Use CVaR₉₅ e drawdown máximo.

**Contra overfit (endurecido vs v1):**

- Walk-forward obrigatório; só out-of-sample conta para alocação.
- Parâmetros livres ≤ 3. Registre `n_trials` de toda busca.
- **Correção para testes múltiplos.** Buscar 200 combinações e reportar a melhor é garantia de falso positivo. Aplique White's Reality Check ou bootstrap de máximo sob a nula; sem isso, o limiar de significância é meaningless. Campo `n_trials` em `backtest_runs` é obrigatório e deve entrar no relatório.
- Superfície de parâmetros precisa ser **estável**: pico isolado = ruído; escolha o centro de um platô.
- Amostra mínima: ≥ 90 dias e ≥ 3 regimes distintos (`ER` alto, `ER` baixo, e um evento de cauda). Menos que isso não autoriza capital.

**Três benchmarks lado a lado, sempre:** HODL 50/50, HODL 100% do volátil, LP full-range. A métrica de saída é **PnL líquido vs HODL**, nunca APY.

---

### 13. Contabilidade de P&L

```
PnL_total   = (V_atual − V_entrada) + fees_coletadas + fees_pendentes
              + rewards − gas − custos_swap ± funding
PnL_vs_HODL = PnL_total − (V_hodl(p) − V_entrada)
```

| Componente | Regra |
|---|---|
| Fee income | collects + pendente on-chain (não estimado) |
| Divergence | `V(p) − V_hodl(p)` com `L` de entrada |
| Rebalance drag | Σ (slippage + swap fee + gas) por evento |
| Rewards | marcados a mercado **no recebimento**, nunca a preço corrente |
| Funding | com sinal; recebido é positivo |

Marcar rewards a preço corrente é a forma mais comum de o dashboard mentir. Rebalance que fecha e reabre posição **encerra o baseline antigo e abre um novo** — carregar o `entry_price` original através de um rebalance corrompe todo o histórico de `pnl_vs_hodl`.

---

## PARTE II — SCHEMA

Postgres 16 + TimescaleDB. `NUMERIC(78,0)` para u256 (máx ≈1.16e77, 78 dígitos), `NUMERIC(40,0)` para u128 (máx ≈3.4e38, 39 dígitos). Quantidades em unidades base. Float só na borda de apresentação.

### 14. Referência

```sql
CREATE TABLE chains (
  id              SMALLINT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN ('evm','svm')),
  native_symbol   TEXT NOT NULL,
  avg_tx_cost_usd NUMERIC(18,6),
  finality_ms     INTEGER
);

CREATE TABLE dexes (
  id                 SMALLINT PRIMARY KEY,
  chain_id           SMALLINT NOT NULL REFERENCES chains(id),
  name               TEXT NOT NULL,
  model              TEXT NOT NULL CHECK (model IN ('clmm_tick','clmm_bin','cpmm','stable')),
  dynamic_fee        BOOLEAN NOT NULL DEFAULT FALSE,
  fee_growth_shift   SMALLINT NOT NULL,     -- 128 (EVM) | 64 (Solana). v1 assumia 128 global
  protocol_fee_share NUMERIC(6,4) NOT NULL DEFAULT 0,
  program_addr       TEXT NOT NULL,
  UNIQUE (chain_id, name)
);

CREATE TABLE tokens (
  id            BIGSERIAL PRIMARY KEY,
  chain_id      SMALLINT NOT NULL REFERENCES chains(id),
  address       TEXT NOT NULL,
  symbol        TEXT,
  decimals      SMALLINT NOT NULL,
  mint_authority_revoked   BOOLEAN,
  freeze_authority_revoked BOOLEAN,
  top10_holder_pct         NUMERIC(6,4),
  first_seen_at            TIMESTAMPTZ,
  risk_flags               JSONB NOT NULL DEFAULT '{}',
  UNIQUE (chain_id, address)
);

CREATE TABLE pools (
  id             BIGSERIAL PRIMARY KEY,
  dex_id         SMALLINT NOT NULL REFERENCES dexes(id),
  address        TEXT NOT NULL,
  token0_id      BIGINT NOT NULL REFERENCES tokens(id),
  token1_id      BIGINT NOT NULL REFERENCES tokens(id),
  fee_tier_bps   NUMERIC(10,4),           -- NULL quando dynamic_fee
  tick_spacing   INTEGER,
  bin_step_bps   INTEGER,
  created_at     TIMESTAMPTZ,
  UNIQUE (dex_id, address),
  CHECK (token0_id < token1_id),          -- ordenação canônica: evita par duplicado invertido
  CHECK (fee_tier_bps IS NOT NULL OR bin_step_bps IS NOT NULL)
);
CREATE INDEX ON pools (token0_id, token1_id);
```

### 15. Estado de mercado

```sql
CREATE TABLE pool_states (
  pool_id            BIGINT NOT NULL REFERENCES pools(id),
  ts                 TIMESTAMPTZ NOT NULL,
  block_or_slot      BIGINT NOT NULL,
  sqrt_price         NUMERIC(78,0) NOT NULL,   -- normalizado para Q64.96 na ingestão
  tick               INTEGER NOT NULL,
  liquidity          NUMERIC(40,0) NOT NULL,   -- L ativa
  depth_v2_equiv_usd NUMERIC(24,6),            -- D₂ = 2·L·√p  (substitui tvl_active da v1)
  fee_growth_global0 NUMERIC(78,0) NOT NULL,
  fee_growth_global1 NUMERIC(78,0) NOT NULL,
  tvl_usd            NUMERIC(24,6),
  PRIMARY KEY (pool_id, ts, block_or_slot)    -- v1 colidia com 2 updates no mesmo ts
);
SELECT create_hypertable('pool_states','ts', chunk_time_interval => INTERVAL '1 day');

CREATE TABLE swaps (
  pool_id           BIGINT NOT NULL REFERENCES pools(id),
  ts                TIMESTAMPTZ NOT NULL,
  block_or_slot     BIGINT NOT NULL,
  tx_ref            TEXT NOT NULL,            -- tx_hash (EVM) | signature (Solana)
  event_path        TEXT NOT NULL,            -- log_index | caminho de inner instruction
  sender            TEXT,
  amount0           NUMERIC(78,0) NOT NULL,   -- sinal: + = pool RECEBEU token0 (base do markout)
  amount1           NUMERIC(78,0) NOT NULL,
  sqrt_price_before NUMERIC(78,0) NOT NULL,   -- v1 só tinha 'after'; segmentação exige os dois
  sqrt_price_after  NUMERIC(78,0) NOT NULL,
  tick_before       INTEGER NOT NULL,
  tick_after        INTEGER NOT NULL,
  liquidity_before  NUMERIC(40,0) NOT NULL,
  fee_amount        NUMERIC(78,0),            -- efetivo; obrigatório em dynamic_fee
  router            TEXT,
  priority_fee      NUMERIC(40,0),
  PRIMARY KEY (pool_id, ts, tx_ref, event_path)
);
SELECT create_hypertable('swaps','ts', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX ON swaps (pool_id, ts DESC);
CREATE INDEX ON swaps (sender, ts DESC);

-- Decomposição multi-tick (§5). Sem isto o fee capture é aproximado.
CREATE TABLE swap_segments (
  pool_id        BIGINT NOT NULL,
  ts             TIMESTAMPTZ NOT NULL,
  tx_ref         TEXT NOT NULL,
  event_path     TEXT NOT NULL,
  seg_index      SMALLINT NOT NULL,
  tick_lo        INTEGER NOT NULL,
  tick_hi        INTEGER NOT NULL,
  liquidity_seg  NUMERIC(40,0) NOT NULL,     -- L ativa neste segmento
  amount_in_seg  NUMERIC(78,0) NOT NULL,
  fee_seg        NUMERIC(78,0) NOT NULL,
  PRIMARY KEY (pool_id, ts, tx_ref, event_path, seg_index)
);
SELECT create_hypertable('swap_segments','ts', chunk_time_interval => INTERVAL '1 day');
```

**Liquidez por tick — redesenho.** A v1 modelava `tick_liquidity` como snapshot completo por timestamp, o que é inviável: milhares de ticks × alta frequência. Correto é **evento + checkpoint**:

```sql
CREATE TABLE tick_liquidity_events (
  pool_id        BIGINT NOT NULL REFERENCES pools(id),
  ts             TIMESTAMPTZ NOT NULL,
  block_or_slot  BIGINT NOT NULL,
  tick_index     INTEGER NOT NULL,
  d_liquidity_net   NUMERIC(40,0) NOT NULL,  -- delta, com sinal
  d_liquidity_gross NUMERIC(40,0) NOT NULL,
  tx_ref         TEXT NOT NULL,
  PRIMARY KEY (pool_id, ts, tick_index, tx_ref)
);
SELECT create_hypertable('tick_liquidity_events','ts', chunk_time_interval => INTERVAL '1 day');

CREATE TABLE tick_liquidity_checkpoints (
  pool_id        BIGINT NOT NULL REFERENCES pools(id),
  ts             TIMESTAMPTZ NOT NULL,       -- cadência: 1/dia + antes de todo backtest
  tick_index     INTEGER NOT NULL,
  liquidity_net  NUMERIC(40,0) NOT NULL,
  liquidity_gross NUMERIC(40,0) NOT NULL,
  PRIMARY KEY (pool_id, ts, tick_index)
);
```

Estado em `t` = checkpoint anterior + replay dos eventos. Custo de armazenamento cai em ordens de grandeza e a reconstrução continua exata.

**Invariantes de integridade** (rodar como teste contínuo, não como script manual):

```sql
-- 1. soma dos liquidity_net de um pool = 0
-- 2. L_ativa reconstruída = pool_states.liquidity, com igualdade EXATA (inteiros)
-- 3. liquidity_gross ≥ |liquidity_net| em todo tick
-- 4. fee_growth_global monotônico módulo wrap
-- 5. Σ fee_seg = fee_amount do swap pai
```

O invariante 2 é o portão de qualidade do sistema inteiro. Aritmética inteira reconcilia exatamente — tolerância percentual aqui esconde bug.

**Retenção.** Bruto 90d (pools sob gestão) / 30d (avaliação); agregados diários para sempre.

```sql
ALTER TABLE swaps SET (timescaledb.compress,
  timescaledb.compress_segmentby='pool_id', timescaledb.compress_orderby='ts DESC');
SELECT add_compression_policy('swaps', INTERVAL '7 days');
```

### 16. Posições e hedges

```sql
CREATE TABLE wallets (
  id        BIGSERIAL PRIMARY KEY,
  chain_id  SMALLINT NOT NULL REFERENCES chains(id),
  address   TEXT NOT NULL,
  label     TEXT,
  read_only BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (chain_id, address)
);

CREATE TABLE strategies (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  pool_id             BIGINT REFERENCES pools(id),
  mode                TEXT NOT NULL DEFAULT 'advisory'
                      CHECK (mode IN ('advisory','dry_run','live')),
  range_width_pct     NUMERIC(10,4) NOT NULL,
  range_skew          NUMERIC(10,4) NOT NULL DEFAULT 0,
  ladder_legs         SMALLINT NOT NULL DEFAULT 1,
  rebalance_trigger   NUMERIC(10,4) NOT NULL,
  hysteresis_band_pct NUMERIC(10,4) NOT NULL,
  hysteresis_min_sec  INTEGER NOT NULL,
  min_edge_multiple   NUMERIC(10,4) NOT NULL DEFAULT 3,   -- κ de §6
  min_edge_ratio      NUMERIC(10,4) NOT NULL DEFAULT 1.3, -- σ_impl/σ_real mínimo
  regime_filter       BOOLEAN NOT NULL DEFAULT TRUE,
  er_quantile_block   NUMERIC(6,4) DEFAULT 0.80,          -- quantil, não constante
  hedge_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  hedge_band_pct      NUMERIC(10,4),
  hedge_venue         TEXT,
  max_position_usd    NUMERIC(24,2) NOT NULL,
  max_daily_loss_usd  NUMERIC(24,2) NOT NULL,
  params              JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE positions (
  id              BIGSERIAL PRIMARY KEY,
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id),
  pool_id         BIGINT NOT NULL REFERENCES pools(id),
  strategy_id     BIGINT REFERENCES strategies(id),   -- v1 deixou sem FK
  nft_mint        TEXT,
  tick_lower      INTEGER NOT NULL,
  tick_upper      INTEGER NOT NULL,
  liquidity       NUMERIC(40,0) NOT NULL,
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ,
  -- baseline congelado; rebalance FECHA esta linha e ABRE outra (§13)
  entry_price     NUMERIC(40,18) NOT NULL,
  entry_amount0   NUMERIC(78,0) NOT NULL,
  entry_amount1   NUMERIC(78,0) NOT NULL,
  entry_value_usd NUMERIC(24,6) NOT NULL,
  parent_position_id BIGINT REFERENCES positions(id), -- encadeia rebalances
  CHECK (tick_lower < tick_upper),
  UNIQUE (wallet_id, pool_id, nft_mint)
);

CREATE TABLE position_events (
  id           BIGSERIAL PRIMARY KEY,
  position_id  BIGINT NOT NULL REFERENCES positions(id),
  ts           TIMESTAMPTZ NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN
                 ('mint','increase','decrease','collect','burn','rebalance')),
  amount0 NUMERIC(78,0), amount1 NUMERIC(78,0),
  fee0 NUMERIC(78,0),    fee1 NUMERIC(78,0),
  gas_usd NUMERIC(18,6), slippage_usd NUMERIC(18,6),
  tx_ref TEXT NOT NULL
);
CREATE INDEX ON position_events (position_id, ts DESC);

-- Faltava na v1, apesar de hedge_size e hedge_enabled existirem
CREATE TABLE hedges (
  id             BIGSERIAL PRIMARY KEY,
  position_id    BIGINT NOT NULL REFERENCES positions(id),
  venue          TEXT NOT NULL,
  opened_at      TIMESTAMPTZ NOT NULL,
  closed_at      TIMESTAMPTZ,
  side           TEXT NOT NULL CHECK (side IN ('short','long')),
  size_token0    NUMERIC(40,18) NOT NULL,
  entry_price    NUMERIC(40,18) NOT NULL,
  margin_usd     NUMERIC(24,6) NOT NULL,
  liq_price      NUMERIC(40,18),
  funding_paid_usd NUMERIC(24,6) NOT NULL DEFAULT 0,  -- negativo = recebido
  fees_usd       NUMERIC(24,6) NOT NULL DEFAULT 0
);

CREATE TABLE position_snapshots (
  position_id       BIGINT NOT NULL REFERENCES positions(id),
  ts                TIMESTAMPTZ NOT NULL,
  price             NUMERIC(40,18) NOT NULL,
  in_range          BOOLEAN NOT NULL,
  value_usd         NUMERIC(24,6) NOT NULL,
  hodl_value_usd    NUMERIC(24,6) NOT NULL,
  fees_earned_usd   NUMERIC(24,6) NOT NULL,
  fees_pending_usd  NUMERIC(24,6) NOT NULL,
  rewards_usd       NUMERIC(24,6) NOT NULL,   -- marcado no recebimento
  costs_usd         NUMERIC(24,6) NOT NULL,
  funding_usd       NUMERIC(24,6) NOT NULL DEFAULT 0,
  divergence_usd    NUMERIC(24,6) NOT NULL,
  pnl_vs_hodl_usd   NUMERIC(24,6) NOT NULL,
  delta_token0      NUMERIC(40,18),
  hedge_size        NUMERIC(40,18),
  cum_time_in_range NUMERIC(10,6),
  PRIMARY KEY (position_id, ts)
);
SELECT create_hypertable('position_snapshots','ts', chunk_time_interval => INTERVAL '30 days');
```

### 17. Métricas derivadas

```sql
CREATE TABLE chain_metrics_weekly (
  chain_id         SMALLINT NOT NULL REFERENCES chains(id),
  week_start       DATE NOT NULL,
  dex_volume_usd   NUMERIC(24,2) NOT NULL,
  volume_stability NUMERIC(10,6),        -- 1 − cv(volume diário)
  avg_gas_usd      NUMERIC(18,6),
  active_pools     INTEGER,
  rank             SMALLINT,
  PRIMARY KEY (chain_id, week_start)
);

CREATE TABLE pool_metrics_daily (
  pool_id            BIGINT NOT NULL REFERENCES pools(id),
  day                DATE NOT NULL,
  volume_usd         NUMERIC(24,2) NOT NULL,
  fees_lp_usd        NUMERIC(24,2) NOT NULL,   -- líquido de protocol_fee_share
  tvl_usd            NUMERIC(24,2) NOT NULL,
  depth_v2_equiv_usd NUMERIC(24,2) NOT NULL,   -- D₂
  sigma_30d          NUMERIC(14,6) NOT NULL,   -- vol anualizada DO RATIO
  sigma_implied      NUMERIC(14,6) NOT NULL,   -- invariante ao range (§4)
  edge_ratio         NUMERIC(14,6) NOT NULL,   -- sigma_implied / sigma_30d ← ranking primário
  reward_apr         NUMERIC(14,6),
  reward_haircut     NUMERIC(6,4),
  efficiency_ratio   NUMERIC(10,6),
  er_q80_90d         NUMERIC(10,6),            -- limiar calibrado, não constante
  routed_ratio       NUMERIC(10,6),
  markout_5m_bps     NUMERIC(14,6),            -- sinal corrigido; + = LP ganha
  markout_30m_bps    NUMERIC(14,6),
  jit_factor         NUMERIC(10,6),
  unique_senders     INTEGER,
  top_sender_pct     NUMERIC(10,6),
  n_bins_active      INTEGER,                  -- seleciona estimador de LVR (§10)
  PRIMARY KEY (pool_id, day)
);
CREATE INDEX ON pool_metrics_daily (day DESC, edge_ratio DESC);
```

### 18. Alertas e backtests

```sql
CREATE TABLE alert_rules (
  id           BIGSERIAL PRIMARY KEY,
  position_id  BIGINT REFERENCES positions(id),
  strategy_id  BIGINT REFERENCES strategies(id),
  kind         TEXT NOT NULL CHECK (kind IN
                 ('range_proximity','range_exit','pnl_target','edge_decay',
                  'depth_spike','markout_negative','oracle_divergence',
                  'hedge_drift','margin_risk','data_gap','circuit_breaker')),
  threshold    NUMERIC(20,8),
  cooldown_sec INTEGER NOT NULL DEFAULT 900,
  channels     TEXT[] NOT NULL DEFAULT '{telegram}',
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (position_id IS NOT NULL OR strategy_id IS NOT NULL)
);

CREATE TABLE alerts (
  id           BIGSERIAL PRIMARY KEY,
  rule_id      BIGINT NOT NULL REFERENCES alert_rules(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity     TEXT NOT NULL CHECK (severity IN ('info','warn','action','critical')),
  dedup_key    TEXT NOT NULL,
  payload      JSONB NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX ON alerts (rule_id, dedup_key, date_trunc('hour', ts));
CREATE INDEX ON alerts (ts DESC) WHERE NOT acknowledged;

CREATE TABLE backtest_runs (
  id                   BIGSERIAL PRIMARY KEY,
  strategy_id          BIGINT NOT NULL REFERENCES strategies(id),
  pool_id              BIGINT NOT NULL REFERENCES pools(id),
  window_start         TIMESTAMPTZ NOT NULL,
  window_end           TIMESTAMPTZ NOT NULL,
  is_out_of_sample     BOOLEAN NOT NULL,
  fee_source           TEXT NOT NULL CHECK (fee_source IN ('reconstructed_segments','modeled')),
  jit_factor_applied   NUMERIC(10,6),
  n_trials             INTEGER NOT NULL,      -- obrigatório: correção de testes múltiplos
  reality_check_pvalue NUMERIC(10,8),
  regimes_covered      SMALLINT NOT NULL,
  pnl_usd              NUMERIC(24,6),
  pnl_vs_hodl_usd      NUMERIC(24,6),
  pnl_vs_fullrange_usd NUMERIC(24,6),
  max_drawdown         NUMERIC(10,6),
  cvar_95              NUMERIC(24,6),
  time_in_range        NUMERIC(10,6),
  rebalance_count      INTEGER,
  total_costs_usd      NUMERIC(24,6),
  params_snapshot      JSONB NOT NULL,
  CHECK (NOT (fee_source = 'modeled' AND is_out_of_sample))
);
```

O `CHECK` final é deliberado: um run com fees modeladas não pode ser registrado como out-of-sample, portanto nunca pode sustentar alocação de capital. Regra no banco, não convenção de equipe.

---

## PARTE III — SEGURANÇA

### 19. Separação de privilégio

| Processo | Acesso | Chaves |
|---|---|---|
| `indexer` / `analyzer` | RPC read-only, DB rw | nenhuma |
| `watcher` | RPC read-only, DB ro, fila | nenhuma |
| `executor` | RPC write | chave, isolada |

O assistente é **advisory por padrão**; execução é opt-in por estratégia e por pool, nunca global.

Na arquitetura host/VM: `executor` na VM isolada, expondo apenas um socket local de assinatura, recebendo transações já construídas e simuladas. **O processo que decide nunca toca a chave; o processo que assina nunca decide.** O signer valida independentemente: allowlist de programas, limites, e recusa dura fora disso — ele não confia no chamador.

**Controles de execução**

- **Simulação obrigatória** (`simulateTransaction` / `eth_call` + `estimateGas`), comparando delta de saldo simulado com o esperado.
- **Simulação não é garantia.** Em EVM, reordenação por MEV muda o estado entre simular e executar; em Solana, o blockhash pode expirar e o estado avançar. O limite de slippage tem que estar **dentro da transação** (`amountOutMinimum`, `other_amount_threshold`), não só no simulador. Isto é o que de fato protege.
- **Allowlist de programas/contratos.** Endereço fora da lista = recusa dura.
- **Limites em camadas** (tx / posição / dia), em arquivo read-only montado, não em variável de ambiente mutável.
- **Sem approve infinito.** EVM: Permit2 com valor e deadline exatos. Solana: revogar delegações após uso.
- **Idempotência.** Toda intenção tem ID; reenvio nunca duplica posição. Crítico em Solana, onde timeout de confirmação não significa falha.
- **Circuit breaker** com retomada manual: drawdown diário, N falhas consecutivas, divergência pool-vs-oracle, lacuna no indexer, margem do hedge sob risco.
- **Liveness do keeper.** Um watcher morto é silencioso e indistinguível de "nada aconteceu". Heartbeat com alerta `critical` — ausência de dados é um evento, não a falta de um.

**Integridade de dados**

- **Quórum de RPC:** todo dado que dispara ação vem de ≥2 provedores independentes; discordância gera alerta, não ação. Um RPC atrasado ou comprometido é vetor de manipulação direto.
- **Pool vs oracle:** fee e IL usam preço do pool; a divergência entre pool e oracle é o detector de manipulação. Divergência sustentada = não opere.
- **Anti-sandwich no rebalance:** slippage apertado, Jito bundle (Solana) ou private mempool (EVM), e **nunca rebalancear durante spike de volatilidade** — que é exatamente quando o gatilho ingênuo manda rebalancear.

**Filtro de token.** Recusa dura se: mint/freeze authority ativa, LP não travada, top-10 acima do limite, idade abaixo do mínimo, ou contrato não verificado (EVM). Registre em `tokens.risk_flags` e exija que a estratégia declare o nível de risco aceito. Fee APR alto em token novo é prêmio de risco de rug, não ineficiência.

---

## PARTE IV — ROADMAP

Ordem deliberada: **contabilidade antes de sinal, sinal antes de execução.** Um sistema que executa com P&L errado perde dinheiro mais rápido que nenhum sistema.

| Fase | Entrega | Critério de conclusão |
|---|---|---|
| 0 | Schema + indexer de 1 pool (SOL/USDC Orca) | invariantes de §15 passam; `L_ativa` reconstruída **bate exatamente** com `pool_states.liquidity` |
| 1 | Segmentação multi-tick + fee capture | `Σ fee_seg = fee_amount` em 100% dos swaps de 30 dias |
| 2 | Posições + P&L decomposto | bate com a UI do DEX ao centavo, incluindo através de um rebalance |
| 3 | Alertas com histerese e dedup | zero duplicados em 7 dias de mercado real |
| 4 | `edge_ratio`, markout, regime | ranking semanal reproduzível; markout com sinal validado contra caso conhecido |
| 5 | Backtest com fees reconstruídas + walk-forward | supera os 3 benchmarks out-of-sample com Reality Check p < 0.05 |
| 6 | Multi-DEX (inclui bins), depois multi-chain | estimador de LVR seleciona por `n_bins_active` |
| 7 | Execução dry-run → live; hedge por último | 30 dias em dry-run sem divergência vs. execução simulada |

---

## 20. Errata v1 → v2

**Erros corrigidos**

| # | v1 | Correção |
|---|---|---|
| 1 | Markout com sinal invertido (LP perdendo dava valor positivo) | redefinido sobre `amount0` do pool; §7 com teste de sanidade nos dois sentidos |
| 2 | Exemplo de §3 usava TVL e volume totais, contradizendo a própria regra de "TVL ativo" | substituído por `D₂ = 2L√p`, computável do estado on-chain; exemplo refeito e validado |
| 3 | `fees = L × Δfee_growth / 2^128` para todas as chains | divisor é `2^64` em Orca/Raydium; virou coluna `dexes.fee_growth_shift` |
| 4 | Swap tratado como pontual em `tick_after` | decomposição em `swap_segments`; `sqrt_price_before` e `liquidity_before` adicionados |
| 5 | `tick_liquidity` como snapshot completo por ts | inviável em volume; virou eventos + checkpoints |
| 6 | Fee de protocolo ignorada | `protocol_fee_share`; `fee_rate_LP = feeTier × (1 − share)` |
| 7 | Banda de Whalley–Wilmott com expoentes imprecisos | substituída pela lei de escala + regra empírica calibrada |
| 8 | Funding tratado como custo | short perp com funding positivo **recebe** carry; modelado com sinal |
| 9 | `LVR_rate` sem declarar condicionalidade a estar em range | explicitado; anualização contra calendário inteiro é erro |
| 10 | `E[τ]` sem mencionar drift `−σ²/2` do log sob preço-martingale | ressalva adicionada (−32% a.a. em σ=80%) |
| 11 | Limiares ER 0.4/0.2 como constantes universais | virou quantil calibrado por par (`er_q80_90d`) |
| 12 | "±10%" ambíguo entre aditivo e multiplicativo | convenção declarada |
| 13 | `pool_states` PK `(pool_id, ts)` colidia | inclui `block_or_slot` |
| 14 | `positions.strategy_id` sem FK | FK adicionada |
| 15 | "Arredonde para dentro, nunca para fora" — afirmado sem base e na direção agressiva | recalcular métricas dos ticks realizados; arredondar para fora quando houver escolha |

**Omissões preenchidas**

AMM de bins (Meteora) tinha suporte no schema e nenhuma matemática — §10. Faltavam tabela `hedges`, emissões com haircut, diluição JIT, escolha de fee tier, correção para testes múltiplos, encadeamento de posição em rebalance, dedup de alertas, liveness do keeper, e o ponto de que simulação não é garantia de execução.

**Resultado reforçado**

A v1 afirmava que concentrar "não melhora o break-even". A derivação de §4 mostra algo mais forte e exato: `W` cancela na desigualdade, e `σ_implícita` é **invariante à largura do range** — confirmado numericamente em cinco larguras (A de 5.4 a 101.5, `fee_APR` de 106% a 1976%, `σ_implícita` constante em 1.2479).

---

## Referências

- Milionis, Moallemi, Roughgarden, Zhang — *Automated Market Making and Loss-Versus-Rebalancing* (2022)
- Uniswap v3 Core whitepaper — tick math e fee growth
- Lo & MacKinlay — Variance Ratio Test (versão heterocedástico-robusta)
- White — *A Reality Check for Data Snooping* (2000)
- Whalley & Wilmott — hedge sob custo de transação
