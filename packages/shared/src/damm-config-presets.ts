/**
 * Curated DAMM v2 static config indices (Meteora pool fee configs).
 * Pubkeys are derived per cluster via `deriveConfigAddress(index)` — same index, same role on devnet/mainnet.
 * @see https://docs.meteora.ag/developer-guides/damm-v2/pool-fee-configs
 */
export type DammConfigPresetMeta = {
  index: number;
  /** Short label for dropdown */
  label: string;
  /** Fee tier + collect mode + static/dynamic */
  detail: string;
};

/** Common permissionless static configs operators reuse across pools. */
export const DAMM_CONFIG_PRESET_CATALOG: DammConfigPresetMeta[] = [
  {
    index: 0,
    label: "0.25% · both tokens · dynamic",
    detail: "Low base fee; volatility dynamic fee; fees in token A and B",
  },
  {
    index: 1,
    label: "0.25% · quote (token B) only · dynamic",
    detail: "Low base fee; dynamic; fees collected in quote side only",
  },
  {
    index: 2,
    label: "0.25% · both tokens · fixed",
    detail: "Low base fee; no dynamic fee component",
  },
  {
    index: 3,
    label: "0.25% · quote only · fixed",
    detail: "Low base fee; quote-side collect; fixed fee",
  },
  {
    index: 8,
    label: "1% · both tokens · dynamic",
    detail: "Higher base fee tier with dynamic component",
  },
  {
    index: 10,
    label: "1% · both tokens · fixed",
    detail: "Common 1% tier; both-token collect; fixed fee",
  },
];

export type DammConfigOption = DammConfigPresetMeta & {
  pubkey: string;
};

/** Derived from `deriveConfigAddress(index)` on cp-amm (same on devnet/mainnet). */
export const DAMM_CONFIG_CATALOG_OPTIONS: DammConfigOption[] =
  DAMM_CONFIG_PRESET_CATALOG.map((meta, i) => ({
    ...meta,
    pubkey: [
      "8CNy9goNQNLM4wtgRw528tUQGMKD3vSuFRZY2gLGLLvF",
      "82p7sVzQWZfCrmStPhsG8BYKwheQkUiXSs2wiqdhwNxr",
      "FzvMYBQ29z2J21QPsABpJYYxQBEKGsxA6w6J2HYceFj8",
      "EQbqYxecZuJsVt6g5QbKTWpNWa3QyWQE5NWz5AZBAiNv",
      "EVRn9bAekgZsVVAHt25AUjA7qpKh4ac7uUMpoSGqgS5U",
      "GXZLjqmebpsy74vqTD6DqSTugTKVwoTi8fZwLAXBsMNN",
    ][i]!,
  }));
