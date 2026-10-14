import BN from "bn.js";

/** Apply basis-point offset above spot sqrt price (integer math on sqrt space). */
export function sqrtAboveSpot(spotSqrt: BN, offsetBps: number): BN {
  if (offsetBps < 0) throw new Error("offsetBps must be non-negative");
  const factor = new BN(10_000 + offsetBps);
  return spotSqrt.mul(factor).div(new BN(10_000));
}

export type OutsideRangeParams = {
  spotSqrt: BN;
  offsetAboveSpotBps: number;
  maxSqrtPrice: BN;
};

export type OutsideRangePlan = {
  minSqrtPrice: BN;
  initSqrtPrice: BN;
  maxSqrtPrice: BN;
};

/**
 * Single-sided create requires initSqrtPrice === minSqrtPrice.
 * Default policy: entire band at or above spot + ε (outside active spot).
 */
/**
 * Upper sqrt bound for the follow-on pool. Default product policy uses protocol max;
 * narrowing (e.g. +1000 bps above min) allows much larger single-sided deposits.
 */
export function resolveMaxSqrtPrice(
  minSqrtPrice: BN,
  protocolMaxSqrt: BN,
  maxAboveMinBps?: number,
): BN {
  if (maxAboveMinBps === undefined) {
    return protocolMaxSqrt;
  }
  if (maxAboveMinBps <= 0) {
    throw new Error("max_sqrt_above_min_bps must be positive");
  }
  const capped = minSqrtPrice
    .mul(new BN(10_000 + maxAboveMinBps))
    .div(new BN(10_000));
  return BN.min(capped, protocolMaxSqrt);
}

export function planOutsideRangeAbove(params: OutsideRangeParams): OutsideRangePlan {
  const { spotSqrt, offsetAboveSpotBps, maxSqrtPrice } = params;
  const minSqrtPrice = sqrtAboveSpot(spotSqrt, offsetAboveSpotBps);
  if (minSqrtPrice.gte(maxSqrtPrice)) {
    throw new Error("minSqrtPrice must be below maxSqrtPrice");
  }
  if (minSqrtPrice.lte(spotSqrt)) {
    throw new Error("planned range must sit above current spot (outside price)");
  }
  return {
    minSqrtPrice,
    initSqrtPrice: minSqrtPrice.clone(),
    maxSqrtPrice,
  };
}
