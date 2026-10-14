import "./load-env.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { assertClusterAllowed } from "./cluster-guard.js";
import { loadConfigFromEnv } from "./config/load.js";
import {
  executeSingleSidedOutside,
  type ExecuteMode,
} from "./execution/create-pool.js";
import { loadPayerKeypair } from "./signer/load-keypair.js";
import { createTrigger } from "./triggers/factory.js";

function parseMode(argv: string[]): ExecuteMode {
  if (argv.includes("--send")) return "send";
  if (argv.includes("--simulate")) return "simulate";
  return "plan";
}

async function main(): Promise<void> {
  assertClusterAllowed();
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const config = loadConfigFromEnv();
  const { resolveSolanaRpcUrl } = await import("./rpc-url.js");
  const rpc = resolveSolanaRpcUrl();
  const connection = new Connection(rpc, "confirmed");

  const needsWalletForPlan =
    config.execution.launch_token_sizing.mode === "percent_of_wallet";
  const payer =
    mode === "plan"
      ? needsWalletForPlan
        ? loadPayerKeypair()
        : null
      : loadPayerKeypair();

  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());

  const trigger = createTrigger(config, connection);
  console.log(
    JSON.stringify({
      event: "arm",
      launchpad: config.launchpad,
      mint: config.mint,
      trigger: config.trigger.type,
      mode,
    }),
  );

  const fire = await trigger.wait({
    mint: new PublicKey(config.mint),
    signal: controller.signal,
  });

  console.log(
    JSON.stringify({
      event: "trigger_fire",
      reason: fire.reason,
      referencePool: fire.referencePool.toBase58(),
    }),
  );

  const cpAmm = new CpAmm(connection);
  const referenceState = await cpAmm.fetchPoolState(fire.referencePool);
  const configState = await cpAmm.fetchConfigState(
    new PublicKey(config.execution.damm_config),
  );

  const result = await executeSingleSidedOutside({
    connection,
    config,
    payer,
    referencePool: fire.referencePool,
    referenceState,
    spotSqrt: referenceState.sqrtPrice,
    configState,
    mode,
  });

  console.log(
    JSON.stringify({
      event: "execution_result",
      mode: result.mode,
      derivedPool: result.derivedPool.toBase58(),
      minSqrt: result.plan.minSqrtPrice.toString(),
      initSqrt: result.plan.initSqrtPrice.toString(),
      maxSqrt: result.plan.maxSqrtPrice.toString(),
      tokenAAmount: result.tokenAAmount.toString(),
      liquidityDelta: result.liquidityDelta.toString(),
      signature: result.signature,
      skipped: result.skipped,
      simulationErr: result.simulationErr,
    }),
  );

  if (result.simulationErr) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
