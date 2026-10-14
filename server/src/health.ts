import { Connection } from "@solana/web3.js";

export type HealthPayload = {
  ok: boolean;
  cluster: string;
  checkedAt: string;
  api: { port: number };
  signer: { configured: boolean };
  rpc: { ok: boolean; latencyMs?: number; error?: string };
};

export function isSignerConfigured(): boolean {
  return Boolean(
    process.env.PAYER_KEYPAIR_SECRET?.trim() ||
      process.env.PAYER_KEYPAIR_PATH?.trim(),
  );
}

export async function buildHealth(
  rpcUrl: string,
  port: number,
): Promise<HealthPayload> {
  const cluster = process.env.SOLANA_CLUSTER ?? "devnet";
  const signer = { configured: isSignerConfigured() };

  const connection = new Connection(rpcUrl, "confirmed");
  const rpcStart = Date.now();
  let rpc: HealthPayload["rpc"];
  try {
    await connection.getSlot("confirmed");
    rpc = { ok: true, latencyMs: Date.now() - rpcStart };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    rpc = { ok: false, error: message };
  }

  const ok = rpc.ok && signer.configured;

  return {
    ok,
    cluster,
    checkedAt: new Date().toISOString(),
    api: { port },
    signer,
    rpc,
  };
}
