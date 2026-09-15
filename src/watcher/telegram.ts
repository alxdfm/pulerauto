/**
 * Telegram alert channel. Without TELEGRAM_BOT_TOKEN → dry-run (log only).
 */

export type TelegramConfig = {
  botToken: string | undefined
  chatId: string | undefined
}

export type SendAlertResult = {
  channel: 'telegram'
  mode: 'live' | 'dry_run'
  ok: boolean
  detail: string
}

export function loadTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  return {
    botToken: env.TELEGRAM_BOT_TOKEN || undefined,
    chatId: env.TELEGRAM_CHAT_ID || undefined,
  }
}

export async function sendTelegramAlert(
  cfg: TelegramConfig,
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<SendAlertResult> {
  if (!cfg.botToken || !cfg.chatId) {
    console.log('[telegram:dry_run]', text)
    return {
      channel: 'telegram',
      mode: 'dry_run',
      ok: true,
      detail: 'TELEGRAM_BOT_TOKEN/CHAT_ID unset — logged only',
    }
  }

  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text,
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    return {
      channel: 'telegram',
      mode: 'live',
      ok: false,
      detail: `${res.status} ${body}`,
    }
  }
  return {
    channel: 'telegram',
    mode: 'live',
    ok: true,
    detail: 'sent',
  }
}

export function formatAlertMessage(opts: {
  kind: string
  severity: string
  dedupKey: string
  payload: Record<string, unknown>
}): string {
  const lines = [
    `[pulerauto] ${opts.severity.toUpperCase()} ${opts.kind}`,
    `key: ${opts.dedupKey}`,
    JSON.stringify(opts.payload),
  ]
  return lines.join('\n')
}
