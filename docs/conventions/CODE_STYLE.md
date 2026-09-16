# Convenções de Código

> TypeScript / Node. Específico deste projeto.

---

## Princípios gerais

1. **Explícito > implícito** — nomes longos e claros valem mais que abreviações
2. **Funções pequenas** — máximo 30 linhas por função; se maior, extraia
3. **Um nível de abstração por função** — não misture lógica de negócio com I/O
4. **Erro explícito** — nunca silenciar erros; sempre logar ou propagar
5. **Sem estado global** — state deve ser local ou passado explicitamente
6. **Precisão** — math canônica e IDs on-chain não usam `number` frouxo

---

## Nomenclatura

```
variáveis:      camelCase         → poolId, edgeRatio, timeInRange
constantes:     SCREAMING_SNAKE   → MAX_RETRIES, FEE_GROWTH_SHIFT_ORCA
funções:        camelCase + verbo → getPosition(), indexPool(), analyzeMarkout()
classes/tipos:  PascalCase        → Position, SwapSegment, EdgeRatio
arquivos:       kebab-case        → swap-segment.ts, edge-ratio.ts
pastas:         kebab-case        → src/indexer/, src/math/
```

> **Atenção:** use sempre os termos do `UBIQUITOUS_LANGUAGE.md` nos nomes acima.

---

## Padrões específicos da stack

### TypeScript
```typescript
// ✅ Prefira tipos explícitos em interfaces públicas
interface CreatePositionInput {
  poolId: string
  tickLower: number
  tickUpper: number
}

// ❌ Evite `any` — use `unknown` e narrowing
function process(data: unknown) { ... }

// ✅ Result pattern para erros de negócio (não throw)
type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// ✅ Liquidez / amounts on-chain: bigint (ou decimal tipado), nunca number
type Liquidity = bigint
```

### Funções assíncronas
```typescript
// ✅ Sempre trate o erro explicitamente
const result = await fetchPosition(id).catch(err => {
  logger.error('fetchPosition failed', { id, err })
  return null
})

// ❌ Nunca deixe promise sem .catch ou try/catch
await fetchPosition(id) // perigoso
```

### Math da spec
- Isolar `W`, `A`, LVR, fee capture, EdgeRatio, Markout e regime em `src/math/` sem I/O
- Testes Vitest devem bater os exemplos numéricos da spec (§2–§4, §7 markout)
- Divisor de fee growth vem de `dexes.fee_growth_shift`, nunca hardcoded único

---

## Estrutura de um módulo

```
src/
  {feature}/
    index.ts           ← exportações públicas do módulo
    {feature}.ts       ← lógica principal
    {feature}.types.ts ← tipos e interfaces
    {feature}.test.ts  ← testes unitários
    {feature}.utils.ts ← helpers locais (não exportar para fora)
```

---

## Comentários — o quê vs por quê

```typescript
// ❌ Ruim — descreve O QUÊ (óbvio pelo código)
// Incrementa o contador
counter++

// ✅ Bom — explica O POR QUÊ (não óbvio)
// Orca usa Q64.64; EVM Uniswap usa Q64.96 — não misturar shifts
const price = sqrtPriceToPrice(sqrtPrice, feeGrowthShift)
```

**Regra:** Se o código já diz o que faz, o comentário é ruído.
Comente apenas decisões não-óbvias, workarounds e trade-offs.

---

## Imports

```typescript
// Ordem: externos → internos → tipos
import { Connection } from '@solana/web3.js'
import { db } from '@/lib/database'
import type { Position } from '@/types'
```

---

## Proibido neste projeto

- Não usar `number` para u128/u256, liquidity ou fee growth
- Não usar callbacks aninhados (use async/await)
- Não usar `var` (use `const`/`let`)
- Não usar `console.log` em processos long-running (logger estruturado)
- Não misturar código do `executor` com credenciais no mesmo processo do `indexer`
