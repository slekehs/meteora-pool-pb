import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Parse a Solana keypair from operator paste:
 * - JSON byte array (Solana CLI keypair file contents)
 * - Base58-encoded 64-byte secret key (common export format)
 * - Base58-encoded 32-byte seed
 */
export function keypairFromSecretInput(input: string): Keypair {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Signing key is empty");
  }

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    if (!Array.isArray(arr) || arr.length < 32) {
      throw new Error("JSON key must be a byte array (32 or 64 bytes)");
    }
    const secret = Uint8Array.from(arr);
    if (secret.length === 64) {
      return Keypair.fromSecretKey(secret);
    }
    if (secret.length === 32) {
      return Keypair.fromSeed(secret);
    }
    throw new Error(`JSON key length ${secret.length} — expected 32 or 64`);
  }

  const decoded = bs58.decode(trimmed);
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }
  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded);
  }
  throw new Error(
    `Base58 key decodes to ${decoded.length} bytes — expected 32 or 64`,
  );
}
