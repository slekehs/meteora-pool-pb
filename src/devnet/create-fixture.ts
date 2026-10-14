/**
 * Devnet-only: create a fake Pump-like setup for UI / pool testing.
 * 1) SPL mint (6 decimals) + mint 1B tokens to payer
 * 2) Meteora DAMM v2 reference pool (your token + SOL) = "graduated" spot pool
 * Prints mint + reference pool for the operator UI.
 */
import {
  createAssociatedTokenAccountIdempotent,
  createMint,
  createSyncNativeInstruction,
  mintTo,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  CpAmm,
  deriveConfigAddress,
  derivePoolAddress,
  getTokenProgram,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import "../load-env.js";
import { assertClusterAllowed } from "../cluster-guard.js";
import { loadPayerKeypair } from "../signer/load-keypair.js";
import { resolveSolanaRpcUrl } from "../rpc-url.js";
import {
  PUMP_LAUNCH_TOKEN_AMOUNT_RAW,
  PUMP_TOKEN_DECIMALS,
} from "@meteora-pool-pb/shared/pump-defaults";

const DAMM_CONFIG_INDEX = 0;
/** Scaled-up stand-in “graduated” pool (same price ratio as 10k : 0.05 SOL). */
const REF_TOKEN_RAW = new BN(100_000_000_000); // 100k tokens @ 6 decimals
const REF_SOL_LAMPORTS = new BN(500_000_000); // 0.5 SOL
/** Narrow band for follow-on pools — enables ~5% single-sided deposits in one tx. */
const FOLLOW_ON_MAX_SQRT_ABOVE_MIN_BPS = 2_000;

async function ensureSol(
  connection: Connection,
  payer: Keypair,
  minSol = 2,
): Promise<void> {
  const bal = await connection.getBalance(payer.publicKey);
  if (bal >= minSol * LAMPORTS_PER_SOL) return;
  console.log(JSON.stringify({ event: "airdrop_request", pubkey: payer.publicKey.toBase58() }));
  const sig = await connection.requestAirdrop(
    payer.publicKey,
    2 * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(sig, "confirmed");
}

async function main(): Promise<void> {
  assertClusterAllowed();
  if (process.env.SOLANA_CLUSTER !== "devnet") {
    throw new Error("devnet:fixture is devnet-only");
  }

  const payer = loadPayerKeypair();
  const connection = new Connection(resolveSolanaRpcUrl(), "confirmed");
  await ensureSol(connection, payer);

  const mintKp = Keypair.generate();
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    PUMP_TOKEN_DECIMALS,
    mintKp,
  );

  const ata = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payer.publicKey,
  );
  await mintTo(
    connection,
    payer,
    mint,
    ata,
    payer,
    BigInt(PUMP_LAUNCH_TOKEN_AMOUNT_RAW),
  );

  const configPk = deriveConfigAddress(new BN(DAMM_CONFIG_INDEX));
  const cpAmm = new CpAmm(connection);
  const configState = await cpAmm.fetchConfigState(configPk);

  const wsolAta = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    NATIVE_MINT,
    payer.publicKey,
  );
  const txWsol = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: wsolAta,
      lamports: REF_SOL_LAMPORTS.toNumber() + 1_000_000,
    }),
    createSyncNativeInstruction(wsolAta),
  );
  await sendAndConfirmTransaction(connection, txWsol, [payer]);
  // sync native is instruction on token program - use spl sync
  const txSync = new Transaction().add(createSyncNativeInstruction(wsolAta));
  await sendAndConfirmTransaction(connection, txSync, [payer]);

  const prepared = cpAmm.preparePoolCreationParams({
    tokenAAmount: REF_TOKEN_RAW,
    tokenBAmount: REF_SOL_LAMPORTS,
    minSqrtPrice: configState.sqrtMinPrice,
    maxSqrtPrice: configState.sqrtMaxPrice,
    collectFeeMode: configState.collectFeeMode,
  });

  const positionNft = Keypair.generate();
  const tokenAProgram = getTokenProgram(0);
  const tokenBProgram = getTokenProgram(0);

  const poolTx = await cpAmm.createPool({
    payer: payer.publicKey,
    creator: payer.publicKey,
    config: configPk,
    positionNft: positionNft.publicKey,
    tokenAMint: mint,
    tokenBMint: NATIVE_MINT,
    initSqrtPrice: prepared.initSqrtPrice,
    liquidityDelta: prepared.liquidityDelta,
    tokenAAmount: REF_TOKEN_RAW,
    tokenBAmount: REF_SOL_LAMPORTS,
    activationPoint: null,
    tokenAProgram,
    tokenBProgram,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  poolTx.recentBlockhash = blockhash;
  poolTx.feePayer = payer.publicKey;
  poolTx.partialSign(payer, positionNft);

  const refSig = await sendAndConfirmRawTransaction(connection, poolTx.serialize(), {
    skipPreflight: false,
  });

  const referencePool = derivePoolAddress(configPk, mint, NATIVE_MINT);

  const fixture = {
    launchpad: "pump" as const,
    mint: mint.toBase58(),
    trigger: { type: "on_migration" as const },
    execution: {
      offset_above_spot_bps: 50,
      max_sqrt_above_min_bps: FOLLOW_ON_MAX_SQRT_ABOVE_MIN_BPS,
      launch_token_sizing: {
        mode: "percent_of_wallet" as const,
        percent: 5,
      },
      damm_config: configPk.toBase58(),
    },
  };

  const outPath = resolve("config/devnet-fixture.yaml");
  writeFileSync(outPath, YAML.stringify(fixture));

  console.log(
    JSON.stringify(
      {
        event: "devnet_fixture_ready",
        mint: mint.toBase58(),
        referencePool: referencePool.toBase58(),
        referencePoolTx: refSig,
        configFile: outPath,
        uiHint:
          "Paste mint + reference pool into the operator UI, or set APP_CONFIG=./config/devnet-fixture.yaml",
      },
      null,
      2,
    ),
  );
}

async function sendAndConfirmRawTransaction(
  connection: Connection,
  raw: Buffer,
  opts: { skipPreflight: boolean },
): Promise<string> {
  const sig = await connection.sendRawTransaction(raw, opts);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
