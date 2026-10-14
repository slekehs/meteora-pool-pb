import { Connection, PublicKey } from "@solana/web3.js";
import type { AppConfig } from "../config/schema.js";
import { OnMigrationTrigger } from "./on-migration.js";
import { PriceRuleTrigger } from "./price-rule.js";
import type { Trigger } from "./types.js";

export function createTrigger(
  config: AppConfig,
  connection: Connection,
): Trigger {
  const mint = new PublicKey(config.mint);
  switch (config.trigger.type) {
    case "on_migration":
      return new OnMigrationTrigger(mint);
    case "price_rule":
      return new PriceRuleTrigger(config, connection);
    default: {
      const _exhaustive: never = config.trigger;
      throw new Error(`Unknown trigger: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
