const ALLOWED = new Set(["devnet", "testnet"]);

export function assertClusterAllowed(): void {
  const cluster = process.env.SOLANA_CLUSTER ?? "devnet";
  if (!ALLOWED.has(cluster)) {
    throw new Error(
      `SOLANA_CLUSTER=${cluster} is blocked in this build. Set devnet for Phase 1.`,
    );
  }
}
