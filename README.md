# meteora-pool-pb

Pump.fun (v1) → configurable **trigger** → always **single-sided Meteora DAMM v2** pool **just outside** spot (launch token only, no quote at create).

Venture docs: [../rick/docs/project/](../rick/docs/project/)

## Setup

```bash
pnpm install
cp .env.example .env
# Edit config/example.yaml and APP_CONFIG in .env
```

## Commands

| Intent | Command |
|--------|---------|
| Typecheck | `pnpm run typecheck` |
| Unit tests | `pnpm test` |
| Plan only | `pnpm run plan` |
| Simulate tx | `pnpm run simulate` |
| Send tx (devnet) | `pnpm run send` |
| Docker test | `docker compose run --rm app-test` |

## Dry-run stub (until Pump watcher lands)

```bash
export SOLANA_CLUSTER=devnet
export APP_CONFIG=./config/example.yaml
export PUMP_STUB_REFERENCE_POOL=<devnet_damm_v2_pool_pubkey>
# Fill mint + damm_config in config/example.yaml
pnpm run plan
pnpm run simulate   # after payer funded + token A balance
pnpm run send       # devnet only (SOLANA_CLUSTER=devnet)
```

## Operator UI (TASK-002)

```bash
# Terminal 1 — API (devnet, key on server)
export SOLANA_CLUSTER=devnet
# Signing: PAYER_KEYPAIR_PATH or PAYER_KEYPAIR_SECRET in app/.env (see .env.example)
pnpm --filter @meteora-pool-pb/server dev

# Terminal 2 — web
pnpm --filter @meteora-pool-pb/web dev
# or both: pnpm run dev:ui
```

Open http://localhost:5173 — preview plan needs a reference DAMM v2 pool pubkey; simulate uses the server keypair (never paste keys in the browser).

## Devnet test (no real Pump token needed)

Creates a **fake launch token** + a **stand-in graduated pool** (your token + SOL on Meteora), then writes `config/devnet-fixture.yaml`.

```bash
# .env: devnet RPC + PAYER_KEYPAIR_PATH (wallet needs devnet SOL)
pnpm run devnet:fixture
```

Copy **mint** and **reference pool** from the script output into the UI, or use **Simulate / Create pool** after filling those fields. This is **not** Pump.fun mainnet — it only exercises Meteora pool creation on devnet.

### Deposit size & SOL (single-sided create)

- Default test policy: **5% of wallet** + **`max_sqrt_above_min_bps: 2000`** (upper price ~20% above entry, not protocol max).
- **Quote SOL is not deposited** into the follow-on pool at create (`tokenBAmount = 0`). SOL on the payer is for **fees + rent** (~**0.02–0.08 SOL** per create; keep **≥1–2 SOL** on devnet for fixture + tests).
- **`pnpm run devnet:fixture`** builds a **larger** fake graduated pool (**100k tokens + 0.5 SOL**, same price ratio as before) and writes `max_sqrt_above_min_bps` into `config/devnet-fixture.yaml`.
- **Mainnet-style 5% single-sided** needs the **narrow band** — using protocol max sqrt caps deposits at ~100 tokens regardless of reference pool size.

## Status

- Slice C: `preparePoolCreationSingleSide` + `createPool` + simulate/send
- Operator web UI: config form + preview/simulate API (devnet)
- Pump graduation watcher: still stub (`PUMP_STUB_REFERENCE_POOL`)
