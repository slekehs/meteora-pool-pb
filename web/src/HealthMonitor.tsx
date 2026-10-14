import { useCallback, useEffect, useState } from "react";

type RpcHealth = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
};

type HealthPayload = {
  cluster: string;
  rpc: RpcHealth;
  checkedAt: string;
};

const POLL_MS = 10_000;

function latencyTier(ms: number): "good" | "ok" | "poor" {
  if (ms < 150) return "good";
  if (ms < 400) return "ok";
  return "poor";
}

export function HealthMonitor() {
  const [rpc, setRpc] = useState<RpcHealth | null>(null);
  const [cluster, setCluster] = useState<string>("…");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/health");
      const body = (await res.json()) as HealthPayload;
      setRpc(body.rpc);
      setCluster(body.cluster ?? "unknown");
    } catch {
      setRpc({ ok: false, error: "API unreachable" });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const tier =
    rpc?.ok && rpc.latencyMs != null ? latencyTier(rpc.latencyMs) : "down";
  const state = !rpc ? "loading" : rpc.ok ? tier : "down";

  const title =
    rpc?.ok && rpc.latencyMs != null
      ? `Solana RPC ${rpc.latencyMs} ms (${cluster}) · click to refresh`
      : rpc?.error
        ? `${rpc.error} · click to refresh`
        : "Checking RPC…";

  return (
    <button
      type="button"
      className={`rpc-pill rpc-pill-${state}${refreshing ? " rpc-pill-busy" : ""}`}
      onClick={() => load()}
      disabled={refreshing}
      title={title}
      aria-live="polite"
    >
      <span className="rpc-pill-dot" aria-hidden />
      <span className="rpc-pill-text">
        <span className="rpc-pill-label">RPC</span>
        {!rpc || refreshing ? (
          <span className="rpc-pill-ms">…</span>
        ) : rpc.ok && rpc.latencyMs != null ? (
          <span className="rpc-pill-ms">{rpc.latencyMs} ms</span>
        ) : (
          <span className="rpc-pill-ms rpc-pill-ms-err">offline</span>
        )}
      </span>
      <span className="rpc-pill-cluster">{cluster}</span>
    </button>
  );
}
