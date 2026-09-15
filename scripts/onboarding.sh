#!/usr/bin/env bash

# =============================================================================
# onboarding.sh — Setup inicial do projeto
# Preenche os placeholders em CLAUDE.md, STACK.md e cria estrutura base.
# Execute: bash scripts/onboarding.sh
# =============================================================================

set -e

# Cores
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

divider() { echo -e "${CYAN}──────────────────────────────────────────${RESET}"; }
ask() { echo -e "${YELLOW}▶ $1${RESET}"; }
info() { echo -e "${GREEN}✓ $1${RESET}"; }
section() { echo ""; divider; echo -e "${BOLD}$1${RESET}"; divider; }

clear
echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     PROJECT SKELETON — ONBOARDING     ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${RESET}"
echo "  Este script configura o contexto inicial do projeto."
echo "  Leva ~3 minutos. Responda com calma — isso alimenta o Claude."
echo ""

# =============================================================================
# BLOCO 1: Identidade do projeto
# =============================================================================
section "1/5 — IDENTIDADE DO PROJETO"

ask "Nome do projeto (sem espaços, ex: callydus-trading):"
read -r PROJECT_NAME

ask "Descrição em uma frase (ex: 'Bot de trading automatizado para Solana perpetuals'):"
read -r PROJECT_DESCRIPTION

ask "Domínio principal (ex: fintech, e-commerce, devtools, web3, saas):"
read -r PROJECT_DOMAIN

TODAY=$(date +%Y-%m-%d)

# =============================================================================
# BLOCO 2: Stack
# =============================================================================
section "2/5 — STACK E TECNOLOGIAS"

ask "Linguagem principal (ex: TypeScript, Python, Rust, Go):"
read -r LANG

ask "Runtime/versão (ex: Node 22, Bun 1.1, Python 3.12):"
read -r RUNTIME

ask "Package manager (ex: pnpm, npm, uv, cargo):"
read -r PKG_MANAGER

echo ""
ask "É um projeto com FRONTEND? (s/n):"
read -r HAS_FRONTEND

FRONTEND_FRAMEWORK="N/A"
FRONTEND_STYLING="N/A"
FRONTEND_STATE="N/A"

if [[ "$HAS_FRONTEND" == "s" || "$HAS_FRONTEND" == "S" ]]; then
  ask "  Framework frontend (ex: Next.js 15, SvelteKit, Vite+React):"
  read -r FRONTEND_FRAMEWORK
  ask "  Estilização (ex: Tailwind 4, CSS Modules):"
  read -r FRONTEND_STYLING
  ask "  State management (ex: Zustand, Context API, nenhum):"
  read -r FRONTEND_STATE
fi

echo ""
ask "É um projeto com BACKEND? (s/n):"
read -r HAS_BACKEND

BACKEND_FRAMEWORK="N/A"
BACKEND_DB="N/A"
BACKEND_AUTH="N/A"

if [[ "$HAS_BACKEND" == "s" || "$HAS_BACKEND" == "S" ]]; then
  ask "  Framework backend (ex: Hono, Fastify, FastAPI, Express):"
  read -r BACKEND_FRAMEWORK
  ask "  Banco de dados + ORM (ex: PostgreSQL + Drizzle, SQLite + Prisma):"
  read -r BACKEND_DB
  ask "  Auth (ex: Clerk, Auth.js, JWT custom, nenhum por ora):"
  read -r BACKEND_AUTH
fi

echo ""
ask "É um projeto WEB3/BLOCKCHAIN? (s/n):"
read -r HAS_WEB3

WEB3_CHAIN="N/A"
WEB3_SDK="N/A"
WEB3_WALLET="N/A"
WEB3_ENV="N/A"

if [[ "$HAS_WEB3" == "s" || "$HAS_WEB3" == "S" ]]; then
  ask "  Chain (ex: Solana, Ethereum, Base):"
  read -r WEB3_CHAIN
  ask "  SDK principal (ex: @solana/web3.js v2, viem, ethers):"
  read -r WEB3_SDK
  ask "  Wallet (ex: Phantom, Backpack, RainbowKit):"
  read -r WEB3_WALLET
  ask "  Ambiente inicial (ex: devnet, testnet, mainnet):"
  read -r WEB3_ENV
fi

# =============================================================================
# BLOCO 3: Arquitetura
# =============================================================================
section "3/5 — ARQUITETURA E PADRÕES"

ask "Padrão arquitetural (ex: modular monolith, feature-based, DDD lite, MVC):"
read -r ARCH_PATTERN

ask "Separação de camadas (ex: controller/service/repo, actions/queries, nenhuma por ora):"
read -r ARCH_LAYERS

ask "Estratégia de testes (ex: Vitest unit, Playwright e2e, nenhuma por ora):"
read -r ARCH_TESTING

ask "Hosting / deploy previsto (ex: Vercel, Railway, Fly.io, VPS, indefinido):"
read -r INFRA_HOSTING

# =============================================================================
# BLOCO 4: Domínio e linguagem ubíqua
# =============================================================================
section "4/5 — LINGUAGEM UBÍQUA DO DOMÍNIO"

echo "  Vamos definir os primeiros termos do domínio."
echo "  Isso é crítico para o Claude não inventar nomes."
echo ""

ask "Qual é a entidade PRINCIPAL do sistema? (ex: Position, Order, Campaign, Proposal):"
read -r ENTITY_MAIN

ask "Defina em uma frase o que é '${ENTITY_MAIN}':"
read -r ENTITY_MAIN_DEF

ask "Qual é a entidade SECUNDÁRIA mais importante? (ex: Strategy, User, Portfolio):"
read -r ENTITY_SECONDARY

ask "Qual o verbo principal de ação no sistema? (ex: execute, submit, process, deploy):"
read -r VERB_MAIN

# =============================================================================
# BLOCO 5: Session Delta Engine (MCP)
# =============================================================================
section "5/5 — MEMÓRIA ENTRE SESSÕES"

ask "Você tem o session-delta MCP instalado? (s/n):"
read -r HAS_SDE

SDE_INSTRUCTION="Se existir \`session-delta\` MCP disponível → chame \`session_start(\"${PROJECT_NAME}\")\`"
if [[ "$HAS_SDE" != "s" && "$HAS_SDE" != "S" ]]; then
  SDE_INSTRUCTION="Leia \`docs/sessions/latest.md\` para carregar o contexto da última sessão"
fi

# =============================================================================
# ESCREVER OS ARQUIVOS
# =============================================================================
section "Gerando arquivos..."

# --- CLAUDE.md ---
sed -i \
  -e "s|{PROJECT_NAME}|${PROJECT_NAME}|g" \
  -e "s|{DOMAIN_DESCRIPTION}|${PROJECT_DESCRIPTION}|g" \
  -e "s|{DATE}|${TODAY}|g" \
  -e "s|{draft\|active\|maintenance}|draft|g" \
  CLAUDE.md

info "CLAUDE.md atualizado"

# --- STACK.md ---
sed -i \
  -e "s|{language}|${LANG}|g" \
  -e "s|{runtime}|${RUNTIME}|g" \
  -e "s|{pkg_manager}|${PKG_MANAGER}|g" \
  -e "s|{framework}.*frontend.*|${FRONTEND_FRAMEWORK}|g" \
  -e "s|{styling}|${FRONTEND_STYLING}|g" \
  -e "s|{state}|${FRONTEND_STATE}|g" \
  -e "s|{framework}.*backend.*|${BACKEND_FRAMEWORK}|g" \
  -e "s|{orm_db}|${BACKEND_DB}|g" \
  -e "s|{auth}|${BACKEND_AUTH}|g" \
  -e "s|{hosting}|${INFRA_HOSTING}|g" \
  -e "s|{chain}|${WEB3_CHAIN}|g" \
  -e "s|{sdk}|${WEB3_SDK}|g" \
  -e "s|{wallet}|${WEB3_WALLET}|g" \
  -e "s|{env}|${WEB3_ENV}|g" \
  -e "s|{pattern}|${ARCH_PATTERN}|g" \
  -e "s|{layers}|${ARCH_LAYERS}|g" \
  -e "s|{testing}|${ARCH_TESTING}|g" \
  docs/architecture/STACK.md

# Substituição de {cicd} e {monitoring} com valores padrão
sed -i \
  -e "s|{cicd}|indefinido|g" \
  -e "s|{monitoring}|nenhum por ora|g" \
  docs/architecture/STACK.md

info "docs/architecture/STACK.md atualizado"

# --- UBIQUITOUS_LANGUAGE.md — adicionar primeiros termos ---
cat >> docs/conventions/UBIQUITOUS_LANGUAGE.md << EOF

---
## Termos iniciais (definidos no onboarding — ${TODAY})

**${ENTITY_MAIN}** — ${ENTITY_MAIN_DEF}
[Nunca use: sinônimos não definidos]

**${ENTITY_SECONDARY}** — {Preencha a definição na primeira sessão de trabalho}
[Nunca use: sinônimos não definidos]

**${VERB_MAIN}** — Ação principal do sistema. Exemplo de uso: \`${VERB_MAIN}${ENTITY_MAIN}\`
EOF

info "docs/conventions/UBIQUITOUS_LANGUAGE.md atualizado com termos iniciais"

# --- latest.md ---
sed -i \
  -e "s|{YYYY-MM-DD HH:MM}|${TODAY} (onboarding)|g" \
  -e "s|{X horas}|N/A — sessão inicial|g" \
  docs/sessions/latest.md

info "docs/sessions/latest.md inicializado"

# --- .gitignore ---
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.venv/
__pycache__/
*.pyc

# Build
dist/
build/
.next/
out/

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# Editors
.vscode/settings.json
.idea/

# Logs
*.log
logs/

# Test coverage
coverage/
.nyc_output/

# Temp
tmp/
.tmp/
EOF

info ".gitignore criado"

# --- .ripgrepignore ---
cat > .ripgrepignore << 'EOF'
# O agente NÃO deve ler estes caminhos ao fazer buscas
# Adicione tudo que gera ruído sem valor para o código

# Deps
node_modules/
.venv/
__pycache__/

# Build e artifacts
dist/
build/
.next/
out/
*.min.js
*.min.css
*.bundle.js

# Locks (raramente úteis para o agente)
package-lock.json
yarn.lock
pnpm-lock.yaml
uv.lock
Cargo.lock

# Gerados automaticamente
*.d.ts.map
*.js.map

# Assets binários
*.png
*.jpg
*.svg
*.ico
*.woff
*.woff2

# Dados de teste grandes
fixtures/large/
*.sql.gz
EOF

info ".ripgrepignore criado"

# =============================================================================
# RESUMO FINAL
# =============================================================================
section "✅ ONBOARDING COMPLETO"

echo ""
echo -e "  ${BOLD}Projeto:${RESET}    ${PROJECT_NAME}"
echo -e "  ${BOLD}Domínio:${RESET}    ${PROJECT_DESCRIPTION}"
echo -e "  ${BOLD}Stack:${RESET}      ${LANG} / ${RUNTIME} / ${PKG_MANAGER}"
echo -e "  ${BOLD}Arquitetura:${RESET} ${ARCH_PATTERN}"
echo -e "  ${BOLD}Entidade principal:${RESET} ${ENTITY_MAIN}"
echo ""
divider
echo ""
echo -e "  ${CYAN}Próximos passos:${RESET}"
echo "  1. Abra o Claude Code nesta pasta"
echo "  2. O Claude vai ler o CLAUDE.md e já saber o contexto"
echo "  3. Complete os {placeholders} restantes em docs/ conforme o projeto evolui"
echo "  4. Toda decisão técnica → use docs/decisions/_TEMPLATE.md"
echo ""
if [[ "$HAS_SDE" == "s" || "$HAS_SDE" == "S" ]]; then
  echo -e "  ${GREEN}Session Delta Engine:${RESET} ativo — Claude chamará session_start automaticamente"
else
  echo -e "  ${YELLOW}Session Delta Engine:${RESET} não instalado — contexto em docs/sessions/latest.md"
  echo "  → Considere instalar: github.com/mibayy/token-savior ou nosso session-delta-engine"
fi
echo ""
divider
