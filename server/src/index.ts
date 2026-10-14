import "../../src/load-env.js";
import { serve } from "@hono/node-server";
import { Connection, PublicKey } from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadAppConfig } from "@meteora-pool-pb/shared";
import { assertClusterAllowed } from "../../src/cluster-guard.js";
import { executeSingleSidedOutside } from "../../src/execution/create-pool.js";
import { readLaunchTokenWalletBalance } from "../../src/execution/resolve-launch-amount.js";
import { loadPayerKeypair } from "../../src/signer/load-keypair.js";
import type { AppConfig } from "@meteora-pool-pb/shared";
import { buildHealth } from "./health.js";
import { listDammConfigOptions } from "./meteora-configs.js";
import { resolveSolanaRpcUrl } from "../../src/rpc-url.js";

const port = Number(process.env.API_PORT ?? 8787);
const rpc = resolveSolanaRpcUrl();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  }),
);

app.get("/health", async (c) => {
  const payload = await buildHealth(rpc, port);
  const status = payload.rpc.ok ? 200 : 503;
  return c.json(payload, status);
});

app.get("/api/v1/meteora/configs", async (c) => {
  try {
    const connection = new Connection(rpc, "confirmed");
    const { source, options } = await listDammConfigOptions(connection);
    return c.json({ ok: true, source, options });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});

type PlanBody = {
  config: unknown;
  referencePool: string;
};

function loadPayerForMode(
  config: AppConfig,
  mode: "plan" | "simulate" | "send",
) {
  if (mode !== "plan") {
    return loadPayerKeypair();
  }
  if (config.execution.launch_token_sizing.mode === "percent_of_wallet") {
    return loadPayerKeypair();
  }
  return null;
}

app.get("/api/v1/wallet/launch-balance", async (c) => {
  try {
    const mintStr = c.req.query("mint");
    if (!mintStr?.trim()) {
      return c.json({ ok: false, error: "mint query required" }, 400);
    }
    const payer = loadPayerKeypair();
    const connection = new Connection(rpc, "confirmed");
    const mint = new PublicKey(mintStr.trim());
    const balance = await readLaunchTokenWalletBalance(
      connection,
      payer.publicKey,
      mint,
    );
    return c.json({
      ok: true,
      payer: payer.publicKey.toBase58(),
      mint: mint.toBase58(),
      balanceRaw: balance.walletBalanceRaw.toString(),
      decimals: balance.decimals,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

async function runExecution(
  body: PlanBody,
  mode: "plan" | "simulate" | "send",
) {
  assertClusterAllowed();
  if (mode !== "plan" && process.env.SOLANA_CLUSTER !== "devnet") {
    throw new Error("simulate/send is devnet-only in v1 UI");
  }

  const config = loadAppConfig(body.config);
  const referencePool = new PublicKey(body.referencePool);
  const connection = new Connection(rpc, "confirmed");
  const cpAmm = new CpAmm(connection);
  const referenceState = await cpAmm.fetchPoolState(referencePool);
  const configState = await cpAmm.fetchConfigState(
    new PublicKey(config.execution.damm_config),
  );

  const payer = loadPayerForMode(config, mode);

  const result = await executeSingleSidedOutside({
    connection,
    config,
    payer,
    referencePool,
    referenceState,
    spotSqrt: referenceState.sqrtPrice,
    configState,
    mode,
  });

  return {
    derivedPool: result.derivedPool.toBase58(),
    minSqrt: result.plan.minSqrtPrice.toString(),
    initSqrt: result.plan.initSqrtPrice.toString(),
    maxSqrt: result.plan.maxSqrtPrice.toString(),
    tokenAAmount: result.tokenAAmount.toString(),
    liquidityDelta: result.liquidityDelta.toString(),
    mode: result.mode,
    skipped: result.skipped,
    simulationErr: result.simulationErr,
    signature: result.signature,
    depositRequestedRaw: result.depositRequestedRaw,
    depositNote: result.depositNote,
    maxDepositRaw: result.maxDepositRaw,
  };
}

app.post("/api/v1/preview-plan", async (c) => {
  try {
    const body = (await c.req.json()) as PlanBody;
    const out = await runExecution(body, "plan");
    return c.json({ ok: true, result: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

app.post("/api/v1/simulate", async (c) => {
  try {
    const body = (await c.req.json()) as PlanBody;
    const out = await runExecution(body, "simulate");
    return c.json({ ok: true, result: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

app.post("/api/v1/send", async (c) => {
  try {
    const body = (await c.req.json()) as PlanBody;
    const out = await runExecution(body, "send");
    return c.json({ ok: true, result: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

serve({ fetch: app.fetch, port }, () => {
  console.log(
    JSON.stringify({
      event: "api_listen",
      port,
      cluster: process.env.SOLANA_CLUSTER ?? "devnet",
    }),
  );
});
