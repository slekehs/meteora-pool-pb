import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  CollectFeeMode,
  CpAmm,
  getTokenProgram,
  type ConfigState,
} from "@meteora-ag/cp-amm-sdk";
import type { OutsideRangePlan } from "./range.js";
import type { ResolvedMints } from "./resolve-mints.js";

export type SingleSidedCreateParams = {
  connection: Connection;
  cpAmm: CpAmm;
  payer: Keypair;
  configPk: PublicKey;
  configState: ConfigState;
  mints: ResolvedMints;
  plan: OutsideRangePlan;
  tokenAAmount: BN;
};

export async function buildSingleSidedCreateTransaction(
  params: SingleSidedCreateParams,
): Promise<{ tx: Transaction; positionNft: Keypair; liquidityDelta: BN }> {
  const {
    connection,
    cpAmm,
    payer,
    configPk,
    configState,
    mints,
    plan,
    tokenAAmount,
  } = params;

  const collectFeeMode = configState.collectFeeMode as CollectFeeMode;
  const liquidityDelta = cpAmm.preparePoolCreationSingleSide({
    tokenAAmount,
    minSqrtPrice: plan.minSqrtPrice,
    maxSqrtPrice: plan.maxSqrtPrice,
    initSqrtPrice: plan.initSqrtPrice,
    collectFeeMode,
  });

  const positionNft = Keypair.generate();
  const tokenAProgram = getTokenProgram(mints.tokenAFlag);
  const tokenBProgram = getTokenProgram(mints.tokenBFlag);

  const tx = await cpAmm.createPool({
    payer: payer.publicKey,
    creator: payer.publicKey,
    config: configPk,
    positionNft: positionNft.publicKey,
    tokenAMint: mints.tokenAMint,
    tokenBMint: mints.tokenBMint,
    initSqrtPrice: plan.initSqrtPrice,
    liquidityDelta,
    tokenAAmount,
    tokenBAmount: new BN(0),
    activationPoint: null,
    tokenAProgram,
    tokenBProgram,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.partialSign(payer, positionNft);

  return { tx, positionNft, liquidityDelta };
}

export async function simulateSingleSidedCreate(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[],
): Promise<boolean> {
  const simulation = await connection.simulateTransaction(tx, signers);
  return simulation.value.err === null;
}

/**
 * Meteora single-sided initialize can fail simulation when deposit is too large
 * for the chosen sqrt band (on-chain transfer > declared tokenAAmount). Binary-
 * search the largest raw deposit that simulates cleanly, capped by `ceiling`.
 */
export async function findMaxSimulatableSingleSidedDeposit(
  params: Omit<SingleSidedCreateParams, "tokenAAmount">,
  ceiling: BN,
): Promise<BN> {
  if (ceiling.lte(new BN(0))) {
    return new BN(0);
  }

  let lo = 1n;
  let hi = BigInt(ceiling.toString());

  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const amount = new BN(mid.toString());
    const { tx, positionNft } = await buildSingleSidedCreateTransaction({
      ...params,
      tokenAAmount: amount,
    });
    const ok = await simulateSingleSidedCreate(params.connection, tx, [
      params.payer,
      positionNft,
    ]);
    if (ok) lo = mid;
    else hi = mid - 1n;
  }

  return new BN(lo.toString());
}
