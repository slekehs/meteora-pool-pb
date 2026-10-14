import { PublicKey } from "@solana/web3.js";
import type { Trigger, TriggerFire, WatchContext } from "./types.js";
import { waitForPumpGraduation } from "../launchpad/pump.js";

export class OnMigrationTrigger implements Trigger {
  constructor(private readonly mint: PublicKey) {}

  async wait(ctx: WatchContext): Promise<TriggerFire> {
    const grad = await waitForPumpGraduation(this.mint, ctx.signal);
    return {
      referencePool: grad.referencePool,
      mint: ctx.mint,
      reason: "pump_graduation",
    };
  }
}
