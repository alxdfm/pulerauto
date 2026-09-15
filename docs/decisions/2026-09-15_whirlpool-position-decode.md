# Decisão: Decoder manual Whirlpool Position + rebalance fecha/abre

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** sessão Epic 2

---

## Contexto

Epic 2 exige ingest de Position e P&L decomposto. O runtime já decodifica Whirlpool / tick arrays sem Orca SDK (ADR decoder). Precisávamos do layout Position e da regra de rebalance sem introduzir SDK.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| `@orca-so/whirlpools-sdk` | Layout sempre atualizado | Dependência pesada; diverge dos ADRs existentes |
| Decoder manual + PDA `["position", mint]` | Alinhado ao stack; testável offline | Manutenção se o programa mudar |
| Só fixtures sem on-chain | Rápido | Não fecha o gate UI |

---

## Decisão tomada

> **Decoder manual** (`src/indexer/position-decode.ts`) com discriminator `account:Position` (`aabc8fe47a40f7d0`), LEN 216, e persistência onde **rebalance fecha a linha pai e abre filho** com `parent_position_id` e entry baseline novo (§13).

---

## Consequências

**Positivas:**
- Consistente com Fixed/Dynamic tick decode
- Rebalance não corrompe `pnl_vs_hodl`

**Negativas / Trade-offs:**
- Layout PositionBundle / Token Extensions fica para depois

**Impacto no código:**
- `src/indexer/position-decode.ts`, `persist-position.ts`, `index-position.ts`
- `src/analyzer/position-snapshot.ts`

---

## Revisão futura

Quando Orca publicar Position com layout diferente ou PositionBundle for necessário para o caso de reconciliação.

---

## Apêndice — layout e eventos (pesquisa 2026-09-15)

Fonte: `orca-so/whirlpools` `programs/whirlpool/src/state/position.rs` (+ `events.rs`).

**Offsets Position (LE, 216 B):** disc@0, whirlpool@8, mint@40, liquidity u128@72, tick_lower i32@88, tick_upper i32@92, fee_growth_checkpoint_a@96, fee_owed_a u64@112, fee_growth_checkpoint_b@120, fee_owed_b u64@136, reward_infos[3]×24 @144.

**PDAs:** `["position", mint]`; bundle: `["position_bundle", bundle_mint]` + `["bundled_position", bundle_mint, String(i)]` (i = u16 decimal ASCII). PositionBundle deferred.

**Descoberta por wallet:** ATAs Token + Token-2022 com `amount === 1` → derivar PDA Position (ou bundle + bitmap).

**Eventos Anchor (`Program data:`) úteis p/ ingest contínuo (ainda não decodificados):**

| Evento | Disc (dec) | Nota |
|--------|------------|------|
| PositionOpened | `237,175,243,230,147,117,101,121` | mint/open |
| LiquidityIncreased | `30,7,144,181,102,254,155,161` | +L + amounts |
| LiquidityDecreased | `166,1,36,71,112,202,181,171` | −L + amounts |
| LiquidityRepositioned | `95,130,181,132,251,50,195,38` | range reset |

Collect/close **não** emitem evento dedicado — fees zeradas on-account; close = conta vazia / NFT burn na tx.
