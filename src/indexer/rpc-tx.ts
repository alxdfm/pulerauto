import type { Connection } from '@solana/web3.js'

export type TxJson = {
  slot: number
  blockTime: number | null
  meta: {
    err: unknown
    logMessages: string[] | null
  } | null
}

type RpcConnection = {
  _rpcRequest: (
    method: string,
    args: unknown[],
  ) => Promise<{ result: unknown; error?: { message: string; code?: number } }>
  _rpcBatchRequest?: (
    requests: { methodName: string; args: unknown[] }[],
  ) => Promise<{ result: unknown; error?: { message: string; code?: number } }[]>
}

function txArgs(signature: string): unknown[] {
  return [
    signature,
    {
      encoding: 'json',
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    },
  ]
}

function logRpcError(signature: string, message: string): void {
  console.error(`getTransaction failed for ${signature}: ${message}`)
}

/**
 * Public RPCs often require maxSupportedTransactionVersion >= 1.
 * web3.js typings only allow 0 — use raw JSON-RPC (supports batch).
 */
export async function getTransactionsJsonBatch(
  connection: Connection,
  signatures: string[],
): Promise<(TxJson | null)[]> {
  if (signatures.length === 0) return []
  const rpc = connection as unknown as RpcConnection

  if (typeof rpc._rpcBatchRequest === 'function') {
    const responses = await rpc._rpcBatchRequest(
      signatures.map((signature) => ({
        methodName: 'getTransaction',
        args: txArgs(signature),
      })),
    )
    return responses.map((res, i) => {
      if (res.error) {
        logRpcError(signatures[i]!, res.error.message)
        return null
      }
      return res.result as TxJson | null
    })
  }

  const out: (TxJson | null)[] = []
  for (const signature of signatures) {
    const res = await rpc._rpcRequest('getTransaction', txArgs(signature))
    if (res.error) {
      logRpcError(signature, res.error.message)
      out.push(null)
    } else {
      out.push(res.result as TxJson | null)
    }
  }
  return out
}

export async function getTransactionJson(
  connection: Connection,
  signature: string,
): Promise<TxJson | null> {
  const [tx] = await getTransactionsJsonBatch(connection, [signature])
  return tx ?? null
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}
