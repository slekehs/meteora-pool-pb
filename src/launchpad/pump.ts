import { PublicKey } from "@solana/web3.js";

export type PumpGraduation = {
  referencePool: PublicKey;
};

/**
 * Detect Pump.fun graduation and resolve the reference AMM pool for spot.
 * TODO(TASK-001): Geyser / tx parser / indexer integration.
 */
export async function waitForPumpGraduation(
  mint: PublicKey,
  signal: AbortSignal,
): Promise<PumpGraduation> {
  void mint;
  if (signal.aborted) throw new Error("aborted");

  const stub = process.env.PUMP_STUB_REFERENCE_POOL;
  if (stub) {
    return { referencePool: new PublicKey(stub) };
  }

  throw new Error(
    "Pump graduation watcher not implemented — set PUMP_STUB_REFERENCE_POOL for dry-run dev",
  );
}
