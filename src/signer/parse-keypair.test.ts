import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { keypairFromSecretInput } from "./parse-keypair.js";

describe("keypairFromSecretInput", () => {
  it("parses JSON byte array", () => {
    const kp = Keypair.generate();
    const restored = keypairFromSecretInput(
      JSON.stringify(Array.from(kp.secretKey)),
    );
    expect(restored.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it("parses base58 secret key", () => {
    const kp = Keypair.generate();
    const restored = keypairFromSecretInput(bs58.encode(kp.secretKey));
    expect(restored.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });
});
