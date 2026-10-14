import { Connection } from "@solana/web3.js";
import { CpAmm, deriveConfigAddress } from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import {
  DAMM_CONFIG_PRESET_CATALOG,
  type DammConfigOption,
} from "@meteora-pool-pb/shared/presets";

const COLLECT_FEE_LABEL: Record<number, string> = {
  0: "both tokens",
  1: "quote (B) only",
  2: "compounding",
};

function presetByIndex(index: number) {
  return DAMM_CONFIG_PRESET_CATALOG.find((p) => p.index === index);
}

function derivePresetOptions(): DammConfigOption[] {
  return DAMM_CONFIG_PRESET_CATALOG.map((meta) => ({
    ...meta,
    pubkey: deriveConfigAddress(new BN(meta.index)).toBase58(),
  }));
}

function formatChainOption(
  pubkey: string,
  account: {
    index: BN | number;
    configType: number;
    collectFeeMode: number;
  },
): DammConfigOption {
  const index =
    typeof account.index === "number"
      ? account.index
      : account.index.toNumber();
  const catalog = presetByIndex(index);
  const collect =
    COLLECT_FEE_LABEL[account.collectFeeMode] ??
    `collect mode ${account.collectFeeMode}`;
  const kind = account.configType === 1 ? "dynamic config" : "static config";
  return {
    index,
    pubkey,
    label: catalog?.label ?? `#${index} · ${collect} · ${kind}`,
    detail:
      catalog?.detail ??
      `Meteora DAMM v2 config index ${index} (${collect}, ${kind})`,
  };
}

export async function listDammConfigOptions(
  connection: Connection,
): Promise<{ source: "chain" | "catalog"; options: DammConfigOption[] }> {
  const catalog = derivePresetOptions();
  try {
    const cpAmm = new CpAmm(connection);
    const statics = await cpAmm.getStaticConfigs();
    const byIndex = new Map<number, DammConfigOption>();

    for (const { publicKey, account } of statics) {
      const opt = formatChainOption(publicKey.toBase58(), account);
      byIndex.set(opt.index, opt);
    }

    // Prefer curated order; append other static configs from chain
    const options: DammConfigOption[] = [];
    for (const meta of DAMM_CONFIG_PRESET_CATALOG) {
      const fromChain = byIndex.get(meta.index);
      options.push(fromChain ?? catalog.find((c) => c.index === meta.index)!);
      byIndex.delete(meta.index);
    }
    const rest = [...byIndex.values()].sort((a, b) => a.index - b.index);
    options.push(...rest);

    return { source: "chain", options };
  } catch {
    return { source: "catalog", options: catalog };
  }
}
