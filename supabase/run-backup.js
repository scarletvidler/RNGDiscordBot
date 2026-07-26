import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
const environmentVariables = {
  prod: "SUPABASE_POSTGRES_URL",
  beta: "SUPABASE_BETA_POSTGRES_URL",
};

const variableName = environmentVariables[target];

if (!variableName) {
  console.error("Usage: node supabase/run-backup.js <prod|beta>");
  process.exit(1);
}

const databaseUrl = process.env[variableName];

if (!databaseUrl) {
  console.error(`Error: ${variableName} is missing from .env.`);
  process.exit(1);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backupScript = join(scriptDirectory, "backup.sh");

let bash = "bash";

if (process.platform === "win32") {
  const gitBash = join(
    process.env.ProgramFiles ?? "C:\\Program Files",
    "Git",
    "bin",
    "bash.exe",
  );

  if (existsSync(gitBash)) {
    bash = gitBash;
  }
}

console.log(`Starting ${target} database backup...`);

const result = spawnSync(bash, [backupScript], {
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BACKUP_TARGET: target,
  },
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`Error: could not start Bash: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
