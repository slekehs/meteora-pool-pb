import { PublicKey } from "@solana/web3.js";
import type { CpAmm } from "@meteora-ag/cp-amm-sdk";

type PoolState = Awaited<ReturnType<CpAmm["fetchPoolState"]>>;

export type ResolvedMints = {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAFlag: number;
  tokenBFlag: number;
};

/** Single-sided create requires launch token as token A (SDK base side). */
export function resolveLaunchAsTokenA(
  reference: PoolState,
  launchMint: PublicKey,
): ResolvedMints {
  const a = reference.tokenAMint;
  const b = reference.tokenBMint;

  if (launchMint.equals(a)) {
    return {
      tokenAMint: a,
      tokenBMint: b,
      tokenAFlag: reference.tokenAFlag,
      tokenBFlag: reference.tokenBFlag,
    };
  }
  if (launchMint.equals(b)) {
    return {
      tokenAMint: b,
      tokenBMint: a,
      tokenAFlag: reference.tokenBFlag,
      tokenBFlag: reference.tokenAFlag,
    };
  }
  throw new Error(
    `config mint ${launchMint.toBase58()} not found on reference pool`,
  );
}
