import BN from "bn.js";
import { describe, expect, it } from "vitest";
import {
  planOutsideRangeAbove,
  resolveMaxSqrtPrice,
  sqrtAboveSpot,
} from "./range.js";

describe("sqrtAboveSpot", () => {
  it("adds bps above spot", () => {
    const spot = new BN(1_000_000);
    const out = sqrtAboveSpot(spot, 100);
    expect(out.gt(spot)).toBe(true);
    expect(out.toString()).toBe("1010000");
  });
});

describe("resolveMaxSqrtPrice", () => {
  it("caps max sqrt above min by bps", () => {
    const min = new BN(1_000_000);
    const protocol = new BN(9_000_000_000_000);
    const out = resolveMaxSqrtPrice(min, protocol, 1000);
    expect(out.toString()).toBe("1100000");
  });
});

describe("planOutsideRangeAbove", () => {
  it("sets init equal to min and above spot", () => {
    const spot = new BN(1_000_000);
    const max = new BN(9_000_000_000_000);
    const plan = planOutsideRangeAbove({
      spotSqrt: spot,
      offsetAboveSpotBps: 50,
      maxSqrtPrice: max,
    });
    expect(plan.initSqrtPrice.eq(plan.minSqrtPrice)).toBe(true);
    expect(plan.minSqrtPrice.gt(spot)).toBe(true);
    expect(plan.maxSqrtPrice.eq(max)).toBe(true);
  });
});
