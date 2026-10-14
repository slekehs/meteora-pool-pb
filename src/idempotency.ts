import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const STATE_PATH =
  process.env.IDEMPOTENCY_STATE_PATH ?? resolve(".state/executions.json");

type StateFile = {
  pools: Record<string, { signature: string; pool: string; at: string }>;
};

function readState(): StateFile {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as StateFile;
  } catch {
    return { pools: {} };
  }
}

function writeState(state: StateFile): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function idempotencyKey(mint: string, config: string): string {
  return `${mint}:${config}`;
}

export function getPriorExecution(key: string): StateFile["pools"][string] | null {
  return readState().pools[key] ?? null;
}

export function recordExecution(
  key: string,
  entry: { signature: string; pool: string },
): void {
  const state = readState();
  state.pools[key] = { ...entry, at: new Date().toISOString() };
  writeState(state);
}
