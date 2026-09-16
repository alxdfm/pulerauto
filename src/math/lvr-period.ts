/**
 * Period LVR cost: LVR_rate × V × time_in_range (spec §3).
 * Rate is annual; timeInRangeYears is the in-range exposure fraction of a year.
 */

export function lvrPeriodCost(opts: {
  lvrRateAnnual: number
  valueQuote: number
  timeInRangeYears: number
}): number {
  const { lvrRateAnnual, valueQuote, timeInRangeYears } = opts
  if (!(valueQuote >= 0 && timeInRangeYears >= 0)) {
    throw new Error('invalid LVR period args')
  }
  return lvrRateAnnual * valueQuote * timeInRangeYears
}

/** Convert seconds in range to years (365.25d). */
export function secondsToYears(seconds: number): number {
  return seconds / (365.25 * 24 * 3600)
}
