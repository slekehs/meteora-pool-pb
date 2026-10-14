/**
 * Solana JSON-RPC endpoint for @solana/web3.js Connection.
 *
 * Preferred: full URL in SOLANA_RPC_URL (Helius key in query string).
 * Optional: HELIUS_API_KEY + cluster — we build the Helius HTTP RPC URL.
 */
export function resolveSolanaRpcUrl(): string {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    const cluster = process.env.SOLANA_CLUSTER ?? "devnet";
    const host =
      cluster === "mainnet-beta" || cluster === "mainnet"
        ? "mainnet.helius-rpc.com"
        : "devnet.helius-rpc.com";
    return `https://${host}/?api-key=${heliusKey}`;
  }

  return "https://api.devnet.solana.com";
}
