import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import { keypairFromSecretInput } from "./parse-keypair.js";

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

export function loadPayerKeypair(): Keypair {
  const inline = process.env.PAYER_KEYPAIR_SECRET?.trim();
  if (inline) {
    return keypairFromSecretInput(inline);
  }
  const path = process.env.PAYER_KEYPAIR_PATH;
  if (!path) {
    throw new Error(
      "Set PAYER_KEYPAIR_PATH (file) or PAYER_KEYPAIR_SECRET (base58/JSON) in app/.env for simulate/send",
    );
  }
  const raw = readFileSync(expandPath(path), "utf8");
  return keypairFromSecretInput(raw);
}
