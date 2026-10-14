import { z } from "zod";
import {
  launchTokenSizingSchema,
  normalizeLaunchTokenSizing,
  type LaunchTokenSizing,
} from "./launch-token-sizing.js";

const priceRuleSchema = z.object({
  kind: z.enum(["dip_pct_from_high", "below_absolute"]),
  value: z.number().positive(),
});

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("on_migration") }),
  z.object({
    type: z.literal("price_rule"),
    price_rule: priceRuleSchema,
  }),
]);

const executionSchema = z
  .object({
    offset_above_spot_bps: z.number().int().nonnegative(),
    /** Cap max sqrt at min * (1 + bps/10000). Omit = Meteora config protocol max. */
    max_sqrt_above_min_bps: z.number().int().positive().optional(),
    damm_config: z.string().min(32),
    launch_token_sizing: launchTokenSizingSchema.optional(),
    launch_token_amount: z.string().regex(/^\d+$/).optional(),
  })
  .transform((execution) => ({
    offset_above_spot_bps: execution.offset_above_spot_bps,
    max_sqrt_above_min_bps: execution.max_sqrt_above_min_bps,
    damm_config: execution.damm_config,
    launch_token_sizing: normalizeLaunchTokenSizing(execution),
  }));

export type ExecutionConfig = z.infer<typeof executionSchema>;

export const appConfigSchema = z.object({
  launchpad: z.literal("pump"),
  mint: z.string().min(32),
  trigger: triggerSchema,
  execution: executionSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export type { LaunchTokenSizing };

export function loadAppConfig(raw: unknown): AppConfig {
  return appConfigSchema.parse(raw);
}
