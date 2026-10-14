import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { AppConfig } from "../config/schema.js";
import { waitForPumpGraduation } from "../launchpad/pump.js";
import type { Trigger, TriggerFire, WatchContext } from "./types.js";

export class PriceRuleTrigger implements Trigger {
  constructor(
    private readonly config: AppConfig,
    private readonly connection: Connection,
  ) {}

  async wait(ctx: WatchContext): Promise<TriggerFire> {
    const rule = this.config.trigger;
    if (rule.type !== "price_rule") {
      throw new Error("PriceRuleTrigger requires price_rule config");
    }

    const grad = await waitForPumpGraduation(ctx.mint, ctx.signal);
    const spot = await readSpotSqrt(this.connection, grad.referencePool);

    if (rule.price_rule.kind === "dip_pct_from_high") {
      // Stub: v1 records high after grad; real impl polls pool price
      const high = spot;
      const threshold = high
        .mul(new BN(100 - rule.price_rule.value))
        .div(new BN(100));
      await pollUntil(
        () => readSpotSqrt(this.connection, grad.referencePool),
        (p) => p.lte(threshold),
        ctx.signal,
      );
    } else {
      const floor = new BN(rule.price_rule.value);
      await pollUntil(
        () => readSpotSqrt(this.connection, grad.referencePool),
        (p) => p.lte(floor),
        ctx.signal,
      );
    }

    return {
      referencePool: grad.referencePool,
      mint: ctx.mint,
      reason: `price_rule:${rule.price_rule.kind}`,
    };
  }
}

async function readSpotSqrt(
  connection: Connection,
  pool: PublicKey,
): Promise<BN> {
  const { CpAmm } = await import("@meteora-ag/cp-amm-sdk");
  const cpAmm = new CpAmm(connection);
  const state = await cpAmm.fetchPoolState(pool);
  return state.sqrtPrice;
}

async function pollUntil(
  read: () => Promise<BN>,
  ok: (v: BN) => boolean,
  signal: AbortSignal,
  intervalMs = 2_000,
): Promise<void> {
  while (!signal.aborted) {
    const v = await read();
    if (ok(v)) return;
    await sleep(intervalMs, signal);
  }
  throw new Error("aborted");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}
