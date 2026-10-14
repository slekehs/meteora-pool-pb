import {
  appConfigSchema,
  type AppConfig,
} from "@meteora-pool-pb/shared";
import {
  applyLaunchTokenSizing,
  formatTokenRaw,
  parseHumanTokenAmount,
} from "@meteora-pool-pb/shared/launch-token-sizing";
import { DAMM_CONFIG_CATALOG_OPTIONS } from "@meteora-pool-pb/shared/presets";
import { useCallback, useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import { HealthMonitor } from "./HealthMonitor";

type ApiResult = {
  derivedPool: string;
  minSqrt: string;
  initSqrt: string;
  maxSqrt: string;
  tokenAAmount: string;
  liquidityDelta: string;
  mode: string;
  skipped?: string;
  simulationErr?: string;
  signature?: string;
  depositRequestedRaw?: string;
  depositNote?: string;
  maxDepositRaw?: string;
};

const CUSTOM_DAMM_CONFIG = "__custom__";

const PERCENT_PRESETS = [5, 80, 25, 50, 75, 100] as const;
const DEFAULT_DEPOSIT_PERCENT = 5;
const DEFAULT_MAX_SQRT_ABOVE_MIN_BPS = 2000;

function explorerClusterQuery(cluster: string): string {
  if (cluster === "devnet") return "?cluster=devnet";
  if (cluster === "mainnet-beta" || cluster === "mainnet") return "";
  if (cluster === "offline" || cluster === "unknown" || cluster === "…") {
    return "?cluster=devnet";
  }
  return `?cluster=${encodeURIComponent(cluster)}`;
}

function explorerTxUrl(signature: string, cluster: string): string {
  return `https://explorer.solana.com/tx/${signature}${explorerClusterQuery(cluster)}`;
}

function explorerAddressUrl(address: string, cluster: string): string {
  return `https://explorer.solana.com/address/${address}${explorerClusterQuery(cluster)}`;
}

async function readApiJson<T extends Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Empty API response (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 404) {
      throw new Error(
        "Wallet balance API not found — restart the API: pnpm run restart:api (in app/)",
      );
    }
    throw new Error(
      `API returned non-JSON (${res.status}). Restart the API if you recently updated the app.`,
    );
  }
}

type WalletBalance = {
  payer: string;
  balanceRaw: string;
  decimals: number;
};

type DammConfigOption = {
  index: number;
  pubkey: string;
  label: string;
  detail: string;
};

function resolveDammConfig(form: FormState): string {
  if (form.dammConfigSelect === CUSTOM_DAMM_CONFIG) {
    return form.dammConfigCustom.trim();
  }
  return form.dammConfigSelect.trim();
}

function configFromForm(
  form: FormState,
  walletBalance: WalletBalance | null,
): AppConfig {
  if (!walletBalance) {
    throw new Error("Enter mint and wait for payer wallet balance");
  }
  const depositRaw = parseHumanTokenAmount(
    form.depositTokens,
    walletBalance.decimals,
  );
  const balanceRaw = BigInt(walletBalance.balanceRaw);
  if (depositRaw <= 0n) {
    throw new Error("token amount must be greater than zero");
  }
  if (depositRaw > balanceRaw) {
    throw new Error("token amount exceeds payer wallet balance");
  }

  const trigger =
    form.triggerType === "on_migration"
      ? { type: "on_migration" as const }
      : {
          type: "price_rule" as const,
          price_rule: {
            kind: form.priceRuleKind,
            value: Number(form.priceRuleValue),
          },
        };

  return {
    launchpad: "pump",
    mint: form.mint.trim(),
    trigger,
    execution: {
      offset_above_spot_bps: Number(form.offsetBps),
      max_sqrt_above_min_bps: Number(form.maxBandBps),
      launch_token_sizing: {
        mode: "fixed",
        amount: depositRaw.toString(),
      },
      damm_config: resolveDammConfig(form),
    },
  };
}

type FormState = {
  mint: string;
  triggerType: "on_migration" | "price_rule";
  priceRuleKind: "dip_pct_from_high" | "below_absolute";
  priceRuleValue: string;
  offsetBps: string;
  maxBandBps: string;
  depositTokens: string;
  dammConfigSelect: string;
  dammConfigCustom: string;
  referencePool: string;
};

const initialForm: FormState = {
  mint: "",
  triggerType: "on_migration",
  priceRuleKind: "dip_pct_from_high",
  priceRuleValue: "10",
  offsetBps: "50",
  maxBandBps: String(DEFAULT_MAX_SQRT_ABOVE_MIN_BPS),
  depositTokens: "",
  dammConfigSelect: "",
  dammConfigCustom: "",
  referencePool: "",
};

export function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [cluster, setCluster] = useState<string>("devnet");
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dammOptions, setDammOptions] = useState<DammConfigOption[]>([]);
  const [dammConfigSource, setDammConfigSource] = useState<string>("");
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(
    null,
  );
  const [walletBalanceError, setWalletBalanceError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((d: { cluster?: string }) => {
        if (d.cluster) setCluster(d.cluster);
      })
      .catch(() => setCluster("offline"));
  }, []);

  useEffect(() => {
    function applyOptions(options: DammConfigOption[], source: string) {
      setDammOptions(options);
      setDammConfigSource(source);
      setForm((f) =>
        f.dammConfigSelect
          ? f
          : { ...f, dammConfigSelect: options[0]?.pubkey ?? "" },
      );
    }

    applyOptions(DAMM_CONFIG_CATALOG_OPTIONS, "catalog");

    fetch("/api/v1/meteora/configs")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<{
          ok?: boolean;
          source?: string;
          options?: DammConfigOption[];
        }>;
      })
      .then((d) => {
        if (d.ok && d.options?.length) {
          applyOptions(d.options, d.source ?? "chain");
        }
      })
      .catch(() => {
        /* keep catalog defaults */
      });
  }, []);

  useEffect(() => {
    const mint = form.mint.trim();
    if (mint.length < 32) {
      setWalletBalance(null);
      setWalletBalanceError(null);
      return;
    }
    const ac = new AbortController();
    setWalletBalanceError(null);
    fetch(`/api/v1/wallet/launch-balance?mint=${encodeURIComponent(mint)}`, {
      signal: ac.signal,
    })
      .then(async (r) => {
        const d = await readApiJson<{
          ok?: boolean;
          error?: string;
          payer?: string;
          balanceRaw?: string;
          decimals?: number;
        }>(r);
        if (!r.ok || !d.ok || d.balanceRaw === undefined || d.decimals === undefined) {
          throw new Error(d.error ?? `balance fetch failed (${r.status})`);
        }
        setWalletBalance({
          payer: d.payer ?? "",
          balanceRaw: d.balanceRaw,
          decimals: d.decimals,
        });
        setForm((f) => {
          if (f.depositTokens.trim()) return f;
          const raw = applyLaunchTokenSizing(
            { mode: "percent_of_wallet", percent: DEFAULT_DEPOSIT_PERCENT },
            BigInt(d.balanceRaw!),
          );
          return {
            ...f,
            depositTokens: formatTokenRaw(
              raw.toString(),
              d.decimals!,
            ),
          };
        });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setWalletBalance(null);
        setWalletBalanceError(
          e instanceof Error ? e.message : String(e),
        );
      });
    return () => ac.abort();
  }, [form.mint]);

  const selectedDammPreset = dammOptions.find(
    (o) => o.pubkey === form.dammConfigSelect,
  );

  const { parsedConfig, validationError: formValidationError } = useMemo(() => {
    try {
      const cfg = configFromForm(form, walletBalance);
      appConfigSchema.parse(cfg);
      return { parsedConfig: cfg, validationError: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { parsedConfig: null, validationError: msg };
    }
  }, [form, walletBalance]);

  const depositRawPreview = useMemo(() => {
    if (!walletBalance || !form.depositTokens.trim()) return null;
    try {
      return parseHumanTokenAmount(
        form.depositTokens,
        walletBalance.decimals,
      ).toString();
    } catch {
      return null;
    }
  }, [form.depositTokens, walletBalance]);

  const showValidation = formValidationError;

  const yamlText = useMemo(() => {
    if (!parsedConfig) return "";
    return YAML.stringify(parsedConfig);
  }, [parsedConfig]);

  const patch = useCallback(
    (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial })),
    [],
  );

  const applyPercentPreset = useCallback(
    (percent: number) => {
      if (!walletBalance) return;
      const raw = applyLaunchTokenSizing(
        { mode: "percent_of_wallet", percent },
        BigInt(walletBalance.balanceRaw),
      );
      patch({
        depositTokens: formatTokenRaw(
          raw.toString(),
          walletBalance.decimals,
        ),
      });
    },
    [walletBalance, patch],
  );

  async function callApi(path: string, opts?: { confirmSend?: boolean }) {
    if (!parsedConfig) return;
    if (!form.referencePool.trim()) {
      setApiError("Reference pool pubkey is required for preview/simulate.");
      return;
    }
    if (path !== "/api/v1/preview-plan") {
      if (opts?.confirmSend) {
        const ok = window.confirm(
          "Send a real devnet transaction and create the pool? This spends SOL and launch tokens from the signing wallet.",
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    setApiError(null);
    setResult(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: parsedConfig,
          referencePool: form.referencePool.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: ApiResult;
      };
      if (!data.ok || !data.result) {
        setApiError(data.error ?? "Request failed");
        return;
      }
      setResult(data.result);
      if (path === "/api/v1/send") {
        if (data.result.signature) return;
        if (data.result.skipped) {
          setApiError(
            `No transaction sent — ${data.result.skipped}. Use a different Meteora fee config (pool already exists for this mint + config).`,
          );
          return;
        }
        if (data.result.simulationErr) {
          setApiError(
            `No transaction sent — simulation failed: ${data.result.simulationErr}. Try a smaller token amount (very large deposits often fail).`,
          );
          return;
        }
        setApiError("No transaction sent — check server logs.");
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const devnet = cluster === "devnet";

  return (
    <div className="app">
      <header className="page-header">
        <h1>Post-Migration Liquidity</h1>
        <p className="tagline">
          Meteora DAMM v2 single-sided pool — operator console
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Pool recipe</h2>
            <HealthMonitor />
          </div>

          <label>
            Launch mint
            <input
              value={form.mint}
              onChange={(e) =>
                patch({ mint: e.target.value, depositTokens: "" })
              }
              placeholder="Token mint pubkey"
              spellCheck={false}
            />
          </label>

          <label>
            Trigger
            <select
              value={form.triggerType}
              onChange={(e) =>
                patch({
                  triggerType: e.target.value as FormState["triggerType"],
                })
              }
            >
              <option value="on_migration">On migration (immediate)</option>
              <option value="price_rule">Price rule (after graduation)</option>
            </select>
          </label>

          {form.triggerType === "price_rule" && (
            <div className="row">
              <label>
                Rule
                <select
                  value={form.priceRuleKind}
                  onChange={(e) =>
                    patch({
                      priceRuleKind: e.target
                        .value as FormState["priceRuleKind"],
                    })
                  }
                >
                  <option value="dip_pct_from_high">Dip % from high</option>
                  <option value="below_absolute">Below absolute</option>
                </select>
              </label>
              <label>
                Value
                <input
                  value={form.priceRuleValue}
                  onChange={(e) => patch({ priceRuleValue: e.target.value })}
                  type="number"
                  min={0}
                  step="any"
                />
              </label>
            </div>
          )}

          <h3 className="subhead">Execution</h3>

          <div className="row">
            <label>
              Offset above spot (bps)
              <input
                value={form.offsetBps}
                onChange={(e) => patch({ offsetBps: e.target.value })}
                type="number"
                min={0}
              />
            </label>
            <label>
              Max price band above min (bps)
              <input
                value={form.maxBandBps}
                onChange={(e) => patch({ maxBandBps: e.target.value })}
                type="number"
                min={1}
              />
            </label>
          </div>
          <p className="field-hint">
            Narrow band (e.g. 2000 = +20% above entry) allows larger single-sided
            deposits; protocol max band caps at ~100 tokens on devnet.
          </p>

          <div className="sizing-block">
            <p className="field-hint">
              Deposit uses the API payer wallet (
              <code>PAYER_KEYPAIR_*</code> in <code>.env</code>).
            </p>
            {walletBalance && (
              <p className="field-hint meta">
                Payer balance:{" "}
                <strong>
                  {formatTokenRaw(
                    walletBalance.balanceRaw,
                    walletBalance.decimals,
                  )}
                </strong>{" "}
                tokens
              </p>
            )}
            {walletBalanceError && (
              <p className="error" role="alert">
                {walletBalanceError}
              </p>
            )}

            <div className="row deposit-row">
              <label className="deposit-amount-label">
                Token amount
                <input
                  value={form.depositTokens}
                  onChange={(e) => patch({ depositTokens: e.target.value })}
                  placeholder={
                    walletBalance ? "e.g. 1000.5" : "Enter mint first"
                  }
                  inputMode="decimal"
                  disabled={!walletBalance}
                />
              </label>
              <div className="percent-presets">
                <span className="preset-label">Quick</span>
                {PERCENT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="ghost preset-btn"
                    disabled={!walletBalance}
                    onClick={() => applyPercentPreset(p)}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {depositRawPreview && (
              <p className="field-hint meta">
                On-chain deposit: {depositRawPreview} raw base units
              </p>
            )}
          </div>

          <label>
            Meteora pool fee config
            <select
              value={form.dammConfigSelect || dammOptions[0]?.pubkey || ""}
              onChange={(e) => patch({ dammConfigSelect: e.target.value })}
            >
              {dammOptions.map((o) => (
                <option key={o.pubkey} value={o.pubkey}>
                  #{o.index} — {o.label}
                </option>
              ))}
              <option value={CUSTOM_DAMM_CONFIG}>Custom pubkey…</option>
            </select>
          </label>
          {selectedDammPreset && form.dammConfigSelect !== CUSTOM_DAMM_CONFIG && (
            <p className="field-hint">{selectedDammPreset.detail}</p>
          )}
          {dammConfigSource && (
            <p className="field-hint meta">
              Config list: {dammConfigSource === "chain" ? "live from RPC" : "catalog fallback"}
            </p>
          )}
          {form.dammConfigSelect === CUSTOM_DAMM_CONFIG && (
            <label>
              Custom DAMM config pubkey
              <input
                value={form.dammConfigCustom}
                onChange={(e) => patch({ dammConfigCustom: e.target.value })}
                placeholder="Meteora static config account"
                spellCheck={false}
              />
            </label>
          )}

          <label>
            Reference pool (preview / simulate)
            <input
              value={form.referencePool}
              onChange={(e) => patch({ referencePool: e.target.value })}
              placeholder="Graduated AMM pool for spot read"
              spellCheck={false}
            />
          </label>

          <p className="field-hint">
            Simulate / create pool: set <code>PAYER_KEYPAIR_PATH</code> or{" "}
            <code>PAYER_KEYPAIR_SECRET</code> in <code>app/.env</code> on the
            machine running the API, then restart the server.
          </p>

          {showValidation && (
            <p className="error" role="alert">
              {showValidation}
            </p>
          )}

          <div className="actions">
            <button
              type="button"
              disabled={!parsedConfig || busy}
              onClick={() => callApi("/api/v1/preview-plan")}
            >
              Preview plan
            </button>
            <button
              type="button"
              className="accent"
              disabled={!parsedConfig || busy || !devnet}
              onClick={() => callApi("/api/v1/simulate")}
            >
              Simulate (devnet)
            </button>
            <button
              type="button"
              className="danger"
              disabled={!parsedConfig || busy || !devnet}
              onClick={() => callApi("/api/v1/send", { confirmSend: true })}
            >
              Create pool (devnet)
            </button>
          </div>
        </section>

        <section className="panel panel-dark">
          <div className="panel-head">
            <h2>Config YAML</h2>
            <button
              type="button"
              className="ghost"
              disabled={!yamlText}
              onClick={() => navigator.clipboard.writeText(yamlText)}
            >
              Copy
            </button>
          </div>
          <pre className="yaml">{yamlText || "# fix validation errors"}</pre>

          {apiError && (
            <p className="error" role="alert">
              {apiError}
            </p>
          )}

          {result && (
            <div className="result">
              <h3>Last run ({result.mode})</h3>
              {result.mode === "send" && result.signature && (
                <div className="explorer-callout">
                  <p className="explorer-callout-title">
                    On-chain ({cluster === "mainnet-beta" ? "mainnet" : cluster})
                  </p>
                  <a
                    className="explorer-link"
                    href={explorerTxUrl(result.signature, cluster)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View transaction on Solana Explorer
                  </a>
                  <a
                    className="explorer-link secondary"
                    href={explorerAddressUrl(result.derivedPool, cluster)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View pool account
                  </a>
                </div>
              )}
              <dl>
                <div>
                  <dt>Derived pool</dt>
                  <dd>
                    <a
                      className="explorer-inline"
                      href={explorerAddressUrl(result.derivedPool, cluster)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {result.derivedPool}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>min / init / max sqrt</dt>
                  <dd>
                    {result.minSqrt} / {result.initSqrt} / {result.maxSqrt}
                  </dd>
                </div>
                <div>
                  <dt>Token deposit (raw)</dt>
                  <dd>{result.tokenAAmount}</dd>
                </div>
                <div>
                  <dt>Liquidity delta</dt>
                  <dd>{result.liquidityDelta}</dd>
                </div>
                {result.depositNote && (
                  <div>
                    <dt>Deposit note</dt>
                    <dd>{result.depositNote}</dd>
                  </div>
                )}
                {result.maxDepositRaw && (
                  <div>
                    <dt>Max simulatable (raw)</dt>
                    <dd>{result.maxDepositRaw}</dd>
                  </div>
                )}
                {result.skipped && (
                  <div>
                    <dt>Skipped</dt>
                    <dd>{result.skipped}</dd>
                  </div>
                )}
                {result.simulationErr && (
                  <div>
                    <dt>Simulation</dt>
                    <dd>{result.simulationErr}</dd>
                  </div>
                )}
                {result.signature && (
                  <div>
                    <dt>Signature</dt>
                    <dd>
                      <a
                        className="explorer-inline"
                        href={explorerTxUrl(result.signature, cluster)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {result.signature}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </section>
      </div>

      <footer className="foot">
        Long-running arm + trigger watch:{" "}
        <code>pnpm run start</code> with <code>APP_CONFIG</code> pointing at
        saved YAML.
      </footer>
    </div>
  );
}
