import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  CollectFeeMode,
  CpAmm,
  derivePoolAddress,
  type ConfigState,
  type PoolState,
} from "@meteora-ag/cp-amm-sdk";
import type { AppConfig } from "../config/schema.js";
import { resolveLaunchTokenAmount } from "./resolve-launch-amount.js";
import {
  getPriorExecution,
  idempotencyKey,
  recordExecution,
} from "../idempotency.js";
import {
  planOutsideRangeAbove,
  resolveMaxSqrtPrice,
  sqrtAboveSpot,
} from "./range.js";
import { resolveLaunchAsTokenA } from "./resolve-mints.js";
import {
  buildSingleSidedCreateTransaction,
  findMaxSimulatableSingleSidedDeposit,
  simulateSingleSidedCreate,
} from "./single-sided-simulate.js";

export type ExecuteMode = "plan" | "simulate" | "send";

export type ExecuteParams = {
  connection: Connection;
  config: AppConfig;
  payer: Keypair | null;
  referencePool: PublicKey;
  referenceState: PoolState;
  spotSqrt: BN;
  configState: ConfigState;
  mode: ExecuteMode;
};

export type ExecuteResult = {
  plan: ReturnType<typeof planOutsideRangeAbove>;
  tokenAAmount: BN;
  liquidityDelta: BN;
  derivedPool: PublicKey;
  mode: ExecuteMode;
  signature?: string;
  skipped?: string;
  simulationErr?: string;
  /** Requested deposit before Meteora band clamp (raw). */
  depositRequestedRaw?: string;
  /** Human-readable note when deposit was clamped for simulation. */
  depositNote?: string;
  /** Largest raw deposit that simulates for this band (when payer present). */
  maxDepositRaw?: string;
};

export async function executeSingleSidedOutside(
  params: ExecuteParams,
): Promise<ExecuteResult> {
  const {
    connection,
    config,
    payer,
    referenceState,
    spotSqrt,
    configState,
    mode,
  } = params;

  const launchMint = new PublicKey(config.mint);
  const mints = resolveLaunchAsTokenA(referenceState, launchMint);
  const configPk = new PublicKey(config.execution.damm_config);
  const sizing = config.execution.launch_token_sizing;

  let tokenAAmount: BN;
  if (sizing.mode === "fixed" && mode === "plan" && !payer) {
    tokenAAmount = new BN(sizing.amount);
  } else {
    if (!payer) {
      throw new Error(
        "payer keypair required to resolve launch amount from wallet (percent sizing or simulate/send)",
      );
    }
    const resolved = await resolveLaunchTokenAmount(
      connection,
      payer.publicKey,
      launchMint,
      sizing,
    );
    tokenAAmount = resolved.depositRaw;
  }

  const requestedRaw = tokenAAmount.toString();

  const maxSqrt = resolveMaxSqrtPrice(
    sqrtAboveSpot(spotSqrt, config.execution.offset_above_spot_bps),
    configState.sqrtMaxPrice,
    config.execution.max_sqrt_above_min_bps,
  );
  const plan = planOutsideRangeAbove({
    spotSqrt,
    offsetAboveSpotBps: config.execution.offset_above_spot_bps,
    maxSqrtPrice: maxSqrt,
  });

  if (plan.minSqrtPrice.lt(configState.sqrtMinPrice)) {
    throw new Error(
      `planned minSqrt ${plan.minSqrtPrice.toString()} below config sqrtMin ${configState.sqrtMinPrice.toString()}`,
    );
  }

  const cpAmm = new CpAmm(connection);

  const derivedPool = derivePoolAddress(
    configPk,
    mints.tokenAMint,
    mints.tokenBMint,
  );

  const idemKey = idempotencyKey(config.mint, config.execution.damm_config);
  const prior = getPriorExecution(idemKey);
  if (prior) {
    return {
      plan,
      tokenAAmount,
      liquidityDelta: new BN(0),
      derivedPool,
      mode,
      skipped: `already recorded pool ${prior.pool} sig ${prior.signature}`,
      depositRequestedRaw: requestedRaw,
    };
  }

  const existing = await connection.getAccountInfo(derivedPool);
  if (existing && existing.data.length > 0) {
    return {
      plan,
      tokenAAmount,
      liquidityDelta: new BN(0),
      derivedPool,
      mode,
      skipped: `pool account already exists: ${derivedPool.toBase58()}`,
      depositRequestedRaw: requestedRaw,
    };
  }

  let depositNote: string | undefined;
  let maxDepositRaw: string | undefined;

  const simulateCtx =
    payer && mode !== "plan"
      ? {
          connection,
          cpAmm,
          payer,
          configPk,
          configState,
          mints,
          plan,
        }
      : null;

  if (simulateCtx) {
    const maxOk = await findMaxSimulatableSingleSidedDeposit(
      simulateCtx,
      tokenAAmount,
    );
    maxDepositRaw = maxOk.toString();
    if (maxOk.lte(new BN(0))) {
      return {
        plan,
        tokenAAmount,
        liquidityDelta: new BN(0),
        derivedPool,
        mode,
        simulationErr:
          "no deposit size simulates for this price band — try a different offset or fee config",
        depositRequestedRaw: requestedRaw,
        maxDepositRaw,
      };
    }
    if (maxOk.lt(tokenAAmount)) {
      depositNote = `Deposit reduced from ${requestedRaw} to ${maxOk.toString()} raw — Meteora single-sided create limit for this band above spot.`;
      tokenAAmount = maxOk;
    }
  }

  const collectFeeMode = configState.collectFeeMode as CollectFeeMode;
  const liquidityDelta = cpAmm.preparePoolCreationSingleSide({
    tokenAAmount,
    minSqrtPrice: plan.minSqrtPrice,
    maxSqrtPrice: plan.maxSqrtPrice,
    initSqrtPrice: plan.initSqrtPrice,
    collectFeeMode,
  });

  if (mode === "plan") {
    return {
      plan,
      tokenAAmount,
      liquidityDelta,
      derivedPool,
      mode,
      depositRequestedRaw: requestedRaw,
      depositNote,
      maxDepositRaw,
    };
  }

  if (!payer) {
    throw new Error("payer keypair required for simulate/send");
  }

  const { tx, positionNft, liquidityDelta: liqFromTx } =
    await buildSingleSidedCreateTransaction({
      connection,
      cpAmm,
      payer,
      configPk,
      configState,
      mints,
      plan,
      tokenAAmount,
    });

  const simOk = await simulateSingleSidedCreate(connection, tx, [
    payer,
    positionNft,
  ]);
  if (!simOk) {
    return {
      plan,
      tokenAAmount,
      liquidityDelta: liqFromTx,
      derivedPool,
      mode,
      simulationErr: JSON.stringify({ InstructionError: "simulation failed after clamp" }),
      depositRequestedRaw: requestedRaw,
      depositNote,
      maxDepositRaw,
    };
  }

  if (mode === "simulate") {
    return {
      plan,
      tokenAAmount,
      liquidityDelta: liqFromTx,
      derivedPool,
      mode,
      depositRequestedRaw: requestedRaw,
      depositNote,
      maxDepositRaw,
    };
  }

  const raw = tx.serialize();
  const signature = await sendAndConfirmRawTransaction(connection, raw, {
    skipPreflight: false,
    maxRetries: 3,
  });

  recordExecution(idemKey, {
    signature,
    pool: derivedPool.toBase58(),
  });

  return {
    plan,
    tokenAAmount,
    liquidityDelta: liqFromTx,
    derivedPool,
    mode,
    signature,
    depositRequestedRaw: requestedRaw,
    depositNote,
    maxDepositRaw,
  };
}
