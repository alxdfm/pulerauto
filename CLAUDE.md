# CLAUDE.md — Project Intelligence

> Este arquivo é o ponto de entrada para toda sessão de trabalho.
> Leia-o completamente antes de qualquer ação.

---

## Protocolo de início de sessão

**Ao abrir qualquer sessão neste projeto, faça SEMPRE em ordem:**

1. Leia este CLAUDE.md completo
2. Leia `docs/architecture/STACK.md` para entender a stack atual
3. Leia `docs/conventions/UBIQUITOUS_LANGUAGE.md` para a linguagem do domínio
4. Se existir `session-delta` MCP disponível → chame `session_start("pulerauto")`
5. Se não existir → leia o arquivo `docs/sessions/latest.md` se existir
6. Confirme: "Contexto carregado. Stack: [X]. Domínio: [Y]. Pronto."

**Nunca assuma contexto que não foi lido. Nunca invente nomes de variáveis, funções ou módulos sem consultar a linguagem ubíqua.**

---

## Sobre este projeto

```
Nome:        pulerauto
Domínio:     descoberta, avaliação e monitoramento de posições CLMM (EVM + Solana)
Status:      draft
Iniciado em: 2026-09-15
```

**Tese central (spec):** ser LP concentrado é vender gamma. Fees são o prêmio; LVR é o custo. Toda decisão deriva da comparação entre os dois.

Especificação técnica: `docs/architecture/lp-assistant-spec-v2.md`

---

## Regras de trabalho

### Arquivos e módulos
- Nenhum arquivo deve ultrapassar **400 linhas**. Se ultrapassar, proponha divisão.
- Um arquivo = uma responsabilidade. Sem misturar domínios.
- Nomes de arquivos sempre em `kebab-case`. Nomes de classes em `PascalCase`.

### Antes de criar qualquer código
1. Confirme que entende o requisito
2. Verifique se já existe algo parecido no codebase (`rg "termo-chave"`)
3. Verifique a linguagem ubíqua em `docs/conventions/UBIQUITOUS_LANGUAGE.md`
4. Proponha a abordagem **antes** de implementar se for algo novo
5. Confira a fase atual do roadmap (Parte IV da spec): contabilidade → sinal → execução

### Busca no codebase
- Use `rg` (ripgrep) para buscas de texto — nunca `grep` puro
- Use `sg` (ast-grep) para buscas estruturais (padrões de código, AST)
- Consulte `.ripgrepignore` para entender o que é ignorado
- Sempre filtre ruído: `rg "termo" --type ts` em vez de busca global

### Decisões técnicas
- Toda decisão não-trivial deve ser registrada em `docs/decisions/`
- Use o template: `docs/decisions/_TEMPLATE.md`
- Uma decisão por arquivo, nomeada `YYYY-MM-DD_titulo.md`

### Ao encerrar sessão
- Se `session-delta` MCP disponível → chame `session_end("resumo do que foi feito")`
- Se não → atualize `docs/sessions/latest.md` com o resumo

---

## Mapa do projeto

```
CLAUDE.md                    ← você está aqui
docs/
  architecture/
    STACK.md                 ← stack, versões, decisões de infra
    OVERVIEW.md              ← diagrama de alto nível do sistema
    WORKPLAN.md              ← plano de trabalho (epics 0–7)
    lp-assistant-spec-v2.md  ← especificação técnica (modelo, schema, roadmap)
  conventions/
    UBIQUITOUS_LANGUAGE.md   ← glossário do domínio (source of truth)
    CODE_STYLE.md            ← padrões de código específicos da stack
  decisions/
    _TEMPLATE.md             ← template para registrar decisões
    YYYY-MM-DD_*.md          ← decisões registradas
  sessions/
    latest.md                ← contexto da última sessão (fallback sem MCP)
migrations/                  ← SQL Timescale
fixtures/                    ← snapshots on-chain / P&L sintético para testes offline
src/
  math/                      ← primitivas + swap-segments + fee-capture + position P&L
                               + EdgeRatio / Markout / regime / SigmaImplied
  db/                        ← client, migrate, invariantes, swap-span
  indexer/                   ← Whirlpool decode, ticks, swaps, Position
  analyzer/                  ← position_snapshots / P&L + pool_metrics_daily / ranking
  watcher/                   ← alertas (histerese + dedup)
  scripts/                   ← CLI (swaps, positions, metrics, watcher, soaks)
scripts/
  onboarding.sh              ← perguntas de setup inicial do projeto
.ripgrepignore               ← o que o agente NÃO deve ler
.gitignore                   ← padrão
```

Processos:

| Processo | Status |
|----------|--------|
| `indexer` | ativo (`src/indexer/`) — pool_states, ticks Fixed/Dynamic, swaps/segments, positions |
| `analyzer` | ativo (`src/analyzer/`) — position_snapshots / P&L; pool_metrics_daily (EdgeRatio / Markout / regime) |
| `watcher` | ativo (`src/watcher/`) — range_exit/proximity/data_gap, Telegram dry-run; edge/markout alerts depois |
| `executor` | previsto Fase 7 (`src/executor/`) |

Math canônica: `src/math/`. DB: `src/db/` + `migrations/` (001–011).

---

## Guardrails — nunca faça isso

- **Nunca** crie arquivos fora da estrutura acima sem propor e receber confirmação
- **Nunca** use sinônimos para termos do domínio — consulte sempre `UBIQUITOUS_LANGUAGE.md`
- **Nunca** deixe um TODO sem uma issue ou decisão linkada
- **Nunca** instale uma dependência nova sem registrar o motivo em `docs/decisions/`
- **Nunca** faça refactor em escopo maior que o pedido — proponha separado
- **Nunca** rode comandos destrutivos (`drop`, `delete`, `rm -rf`) sem confirmação explícita
- **Nunca** use float para estado on-chain, fee growth ou P&L canônico — `NUMERIC` / `bigint`
- **Nunca** pule fases do roadmap: contabilidade antes de sinal, sinal antes de execução

---

## Referências rápidas

- Spec: `docs/architecture/lp-assistant-spec-v2.md`
- Convenções de código: `docs/conventions/CODE_STYLE.md`
- Stack atual: `docs/architecture/STACK.md`
- Glossário: `docs/conventions/UBIQUITOUS_LANGUAGE.md`
- Última sessão: `docs/sessions/latest.md`
