import { z } from "zod";

export const launchTokenSizingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("percent_of_wallet"),
    percent: z.number().min(0).max(100),
  }),
  z.object({
    mode: z.literal("fixed"),
    amount: z.string().regex(/^\d+$/),
  }),
]);

export type LaunchTokenSizing = z.infer<typeof launchTokenSizingSchema>;

export type ExecutionInput = {
  offset_above_spot_bps: number;
  damm_config: string;
  launch_token_sizing?: LaunchTokenSizing;
  /** Legacy YAML — treated as fixed raw amount */
  launch_token_amount?: string;
};

export type NormalizedExecution = {
  offset_above_spot_bps: number;
  damm_config: string;
  launch_token_sizing: LaunchTokenSizing;
};

export function normalizeLaunchTokenSizing(
  execution: ExecutionInput,
): LaunchTokenSizing {
  if (execution.launch_token_sizing) {
    return execution.launch_token_sizing;
  }
  if (execution.launch_token_amount) {
    return { mode: "fixed", amount: execution.launch_token_amount };
  }
  return { mode: "percent_of_wallet", percent: 100 };
}

/** Display raw base units as a decimal token string. */
export function formatTokenRaw(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  const s = raw.padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Parse human token amount (e.g. `1000.5`) to raw base units. */
export function parseHumanTokenAmount(
  value: string,
  decimals: number,
): bigint {
  const s = value.trim();
  if (!s) {
    throw new Error("token amount is required");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error("token amount must be a number");
  }
  const [wholePart, fracPart = ""] = s.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`token amount has more than ${decimals} decimal places`);
  }
  const frac = fracPart.padEnd(decimals, "0");
  const scale = 10n ** BigInt(decimals);
  return BigInt(wholePart || "0") * scale + BigInt(frac || "0");
}

/** Integer raw-token math: floor(balance * percent / 100). */
export function applyLaunchTokenSizing(
  sizing: LaunchTokenSizing,
  walletBalanceRaw: bigint,
): bigint {
  if (walletBalanceRaw < 0n) {
    throw new Error("wallet balance must be non-negative");
  }

  if (sizing.mode === "fixed") {
    const amount = BigInt(sizing.amount);
    if (amount <= 0n) {
      throw new Error("fixed launch amount must be positive");
    }
    if (amount > walletBalanceRaw) {
      throw new Error(
        `fixed amount ${sizing.amount} exceeds wallet balance ${walletBalanceRaw.toString()}`,
      );
    }
    return amount;
  }

  if (sizing.percent <= 0) {
    throw new Error("percent_of_wallet must be greater than 0");
  }
  if (sizing.percent === 100) {
    return walletBalanceRaw;
  }
  return (walletBalanceRaw * BigInt(Math.trunc(sizing.percent))) / 100n;
}
