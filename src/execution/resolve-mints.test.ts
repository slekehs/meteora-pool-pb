import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { resolveLaunchAsTokenA } from "./resolve-mints.js";

const mintA = new PublicKey("11111111111111111111111111111112");
const mintB = new PublicKey("11111111111111111111111111111113");

describe("resolveLaunchAsTokenA", () => {
  it("keeps order when launch is token A", () => {
    const ref = {
      tokenAMint: mintA,
      tokenBMint: mintB,
      tokenAFlag: 0,
      tokenBFlag: 0,
    } as Parameters<typeof resolveLaunchAsTokenA>[0];

    const r = resolveLaunchAsTokenA(ref, mintA);
    expect(r.tokenAMint.equals(mintA)).toBe(true);
    expect(r.tokenBMint.equals(mintB)).toBe(true);
  });

  it("swaps so launch becomes token A", () => {
    const ref = {
      tokenAMint: mintA,
      tokenBMint: mintB,
      tokenAFlag: 1,
      tokenBFlag: 2,
    } as Parameters<typeof resolveLaunchAsTokenA>[0];

    const r = resolveLaunchAsTokenA(ref, mintB);
    expect(r.tokenAMint.equals(mintB)).toBe(true);
    expect(r.tokenBMint.equals(mintA)).toBe(true);
    expect(r.tokenAFlag).toBe(2);
    expect(r.tokenBFlag).toBe(1);
  });
});
