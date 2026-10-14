import { describe, expect, it } from "vitest";
import {
  applyLaunchTokenSizing,
  normalizeLaunchTokenSizing,
  parseHumanTokenAmount,
  formatTokenRaw,
} from "./launch-token-sizing.js";

describe("normalizeLaunchTokenSizing", () => {
  it("defaults to 100% of wallet", () => {
    expect(
      normalizeLaunchTokenSizing({
        offset_above_spot_bps: 50,
        damm_config: "x",
      }),
    ).toEqual({ mode: "percent_of_wallet", percent: 100 });
  });

  it("maps legacy launch_token_amount to fixed", () => {
    expect(
      normalizeLaunchTokenSizing({
        launch_token_amount: "42",
        offset_above_spot_bps: 0,
        damm_config: "x",
      }),
    ).toEqual({ mode: "fixed", amount: "42" });
  });
});

describe("parseHumanTokenAmount", () => {
  it("parses whole and fractional tokens", () => {
    expect(parseHumanTokenAmount("1000", 6)).toBe(1_000_000_000n);
    expect(parseHumanTokenAmount("1000.5", 6)).toBe(1_000_500_000n);
  });
});

describe("formatTokenRaw", () => {
  it("formats raw to decimal string", () => {
    expect(formatTokenRaw("1000500000", 6)).toBe("1000.5");
  });
});

describe("applyLaunchTokenSizing", () => {
  it("applies percent with floor division", () => {
    expect(
      applyLaunchTokenSizing(
        { mode: "percent_of_wallet", percent: 50 },
        1_000_000_001n,
      ),
    ).toBe(500_000_000n);
  });

  it("rejects fixed above balance", () => {
    expect(() =>
      applyLaunchTokenSizing({ mode: "fixed", amount: "100" }, 99n),
    ).toThrow(/exceeds wallet balance/);
  });
});
