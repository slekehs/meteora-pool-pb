import type { PublicKey } from "@solana/web3.js";

export type TriggerFire = {
  referencePool: PublicKey;
  mint: PublicKey;
  reason: string;
};

export type WatchContext = {
  mint: PublicKey;
  signal: AbortSignal;
};

export interface Trigger {
  wait(ctx: WatchContext): Promise<TriggerFire>;
}
