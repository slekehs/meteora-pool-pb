import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Load `app/.env` whether the process cwd is `app/` or `app/server/`. */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(appRoot, ".env") });
