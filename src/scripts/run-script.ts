/** Shared CLI entry helper — closes resources and sets exit code on failure. */

export async function runScript(
  main: () => Promise<void>,
  cleanup?: () => Promise<void>,
): Promise<void> {
  try {
    await main()
  } catch (err) {
    console.error(err)
    process.exitCode = 1
  } finally {
    if (cleanup) {
      await cleanup().catch((err) => {
        console.error('cleanup failed', err)
      })
    }
  }
}
