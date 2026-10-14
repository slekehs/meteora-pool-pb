import {
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { LaunchTokenSizing } from "@meteora-pool-pb/shared";
import { applyLaunchTokenSizing } from "@meteora-pool-pb/shared/launch-token-sizing";

export type LaunchTokenBalance = {
  walletBalanceRaw: BN;
  decimals: number;
};

export async function readLaunchTokenWalletBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<LaunchTokenBalance> {
  const mintInfo = await getMint(connection, mint);

  let balance = 0n;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const ata = getAssociatedTokenAddressSync(mint, owner, false, programId);
    try {
      const acc = await getAccount(connection, ata, undefined, programId);
      balance += acc.amount;
    } catch {
      /* no ATA for this program */
    }
  }

  return {
    walletBalanceRaw: new BN(balance.toString()),
    decimals: mintInfo.decimals,
  };
}

export async function resolveLaunchTokenAmount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  sizing: LaunchTokenSizing,
): Promise<LaunchTokenBalance & { depositRaw: BN }> {
  const { walletBalanceRaw, decimals } = await readLaunchTokenWalletBalance(
    connection,
    owner,
    mint,
  );

  const deposit = applyLaunchTokenSizing(
    sizing,
    BigInt(walletBalanceRaw.toString()),
  );
  if (deposit <= 0n) {
    throw new Error(
      "resolved launch token deposit is zero — fund payer ATA or adjust sizing",
    );
  }

  return {
    walletBalanceRaw,
    decimals,
    depositRaw: new BN(deposit.toString()),
  };
}
