/**
 * Alert dedup: cooldown since last fire + hourly unique key (spec §18).
 */

export type DedupCheckInput = {
  lastAlertAt: Date | null
  now: Date
  cooldownSec: number
}

export function withinCooldown(input: DedupCheckInput): boolean {
  if (input.lastAlertAt === null) return false
  const elapsed =
    (input.now.getTime() - input.lastAlertAt.getTime()) / 1000
  return elapsed < input.cooldownSec
}

export function canEmitAlert(input: DedupCheckInput): boolean {
  return !withinCooldown(input)
}

/** Stable dedup key for a rule episode (position + kind). */
export function buildDedupKey(parts: {
  kind: string
  positionId?: number | null
  strategyId?: number | null
  extra?: string
}): string {
  const scope =
    parts.positionId != null
      ? `pos:${parts.positionId}`
      : `strat:${parts.strategyId ?? 'none'}`
  return [parts.kind, scope, parts.extra ?? ''].filter(Boolean).join('|')
}
