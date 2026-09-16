/**
 * WalkForward folds — temporal train/test partitions (spec §12).
 */

export type WalkForwardFold = {
  foldIndex: number
  trainStart: Date
  trainEnd: Date
  testStart: Date
  testEnd: Date
  isOutOfSample: true
}

export type WalkForwardInput = {
  windowStart: Date
  windowEnd: Date
  /** Train length in days (exclusive of test). */
  trainDays: number
  /** Test (OOS) length in days per fold. */
  testDays: number
  /** Step forward in days between fold starts (default = testDays). */
  stepDays?: number
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

/**
 * Expanding or rolling train window ending immediately before each OOS test.
 * Only folds whose testEnd ≤ windowEnd are returned.
 */
export function walkForwardFolds(input: WalkForwardInput): WalkForwardFold[] {
  const { windowStart, windowEnd, trainDays, testDays } = input
  if (!(trainDays > 0 && testDays > 0)) {
    throw new Error('trainDays and testDays must be > 0')
  }
  if (!(windowEnd.getTime() > windowStart.getTime())) {
    throw new Error('windowEnd must be after windowStart')
  }
  const stepDays = input.stepDays ?? testDays
  if (!(stepDays > 0)) throw new Error('stepDays must be > 0')

  const folds: WalkForwardFold[] = []
  let foldIndex = 0
  let testStart = addDays(windowStart, trainDays)

  while (true) {
    const testEnd = addDays(testStart, testDays)
    if (testEnd.getTime() > windowEnd.getTime()) break
    const trainEnd = testStart
    const trainStart = addDays(trainEnd, -trainDays)
    if (trainStart.getTime() < windowStart.getTime()) {
      testStart = addDays(testStart, stepDays)
      continue
    }
    folds.push({
      foldIndex,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      isOutOfSample: true,
    })
    foldIndex += 1
    testStart = addDays(testStart, stepDays)
  }
  return folds
}
