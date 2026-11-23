import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SKUFlags, SKUType } from "discord.js";
import { getSupabaseAdmin } from "./client.ts";
import {
  getSkuAction,
  upsertSkuAction,
  type SkuActionInput,
} from "./models/skuFulfillment.ts";

export interface ConfigurePlanOptions {
  applicationId: string;
  effectiveFrom: string;
  starter?: string;
  basic?: string;
  plus?: string;
  topup?: string;
  quantity?: number;
  enable: boolean;
  apply: boolean;
  replace: boolean;
}

interface CatalogSku {
  application_id: string;
  id: string;
  name: string;
  type: number;
  flags: number;
}

function validateId(id: string): void {
  if (!/^[0-9]{1,20}$/.test(id)) {
    throw new Error("Application and SKU IDs must be Discord snowflake IDs.");
  }
}

export function parsePlanOptions(args: string[]): ConfigurePlanOptions {
  const { values } = parseArgs({
    args,
    options: {
      app: { type: "string" },
      "effective-from": { type: "string" },
      starter: { type: "string" },
      basic: { type: "string" },
      plus: { type: "string" },
      topup: { type: "string" },
      quantity: { type: "string" },
      enable: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      replace: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (!values.app || !values["effective-from"]) {
    throw new Error(
      "Provide --app and --effective-from with an explicit UTC launch date.",
    );
  }

  const options: ConfigurePlanOptions = {
    applicationId: values.app,
    effectiveFrom: values["effective-from"],
    starter: values.starter,
    basic: values.basic,
    plus: values.plus,
    topup: values.topup,
    quantity:
      values.quantity === undefined ? undefined : Number(values.quantity),
    enable: values.enable,
    apply: values.apply,
    replace: values.replace,
  };
  buildPlanActions(options);
  return options;
}

export function buildPlanActions(
  options: ConfigurePlanOptions,
): SkuActionInput[] {
  validateId(options.applicationId);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
      options.effectiveFrom,
    ) ||
    !Number.isFinite(Date.parse(options.effectiveFrom))
  ) {
    throw new Error(
      "--effective-from must be a UTC timestamp, for example 2026-12-01T00:00:00Z.",
    );
  }

  const skuIds = [
    options.starter,
    options.basic,
    options.plus,
    options.topup,
  ].filter((id): id is string => id !== undefined);
  const effectiveFrom = new Date(options.effectiveFrom).toISOString();
  if (effectiveFrom.slice(0, 19) !== options.effectiveFrom.slice(0, 19)) {
    throw new Error("--effective-from must be a valid calendar date and time.");
  }
  if (!skuIds.length) {
    throw new Error(
      "Provide at least one of --starter, --basic, --plus or --topup.",
    );
  }
  skuIds.forEach(validateId);
  if (new Set(skuIds).size !== skuIds.length)
    throw new Error("Each product needs a different SKU ID.");

  if (options.topup) {
    if (
      !Number.isInteger(options.quantity) ||
      options.quantity! < 1 ||
      options.quantity! > 2_147_483_647
    ) {
      throw new Error(
        "--topup requires --quantity with a positive whole token amount.",
      );
    }
  } else if (options.quantity !== undefined) {
    throw new Error("--quantity is only used with --topup.");
  }

  const actions: SkuActionInput[] = [];
  for (const [skuId, quantity, rolloverMonths] of [
    [options.starter, 15_000, 0],
    [options.basic, 35_000, 0],
    [options.plus, 70_000, 1],
  ] as const) {
    if (!skuId) continue;
    actions.push({
      application_id: options.applicationId,
      sku_id: skuId,
      enabled: options.enable,
      mode: "while_active",
      grant_action: "grant_plan",
      grant_settings: {
        quantity,
        features: rolloverMonths
          ? ["emotion_tags", "voice_selection", "higher_voice_modules"]
          : [],
        rollover_months: rolloverMonths,
      },
      remove_action: "remove_plan",
      remove_settings: {},
      effective_from: effectiveFrom,
    });
  }

  if (options.topup) {
    actions.push({
      application_id: options.applicationId,
      sku_id: options.topup,
      enabled: options.enable,
      mode: "once",
      grant_action: "grant_tokens",
      grant_settings: { quantity: options.quantity!, redeem_to_guild: true },
      remove_action: "remove_tokens",
      remove_settings: {},
      effective_from: effectiveFrom,
    });
  }
  return actions;
}

export async function configurePlans(options: ConfigurePlanOptions) {
  const actions = buildPlanActions(options);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  if (
    process.env.CLIENT_ID &&
    process.env.CLIENT_ID !== options.applicationId
  ) {
    throw new Error("--app must match CLIENT_ID in the selected environment.");
  }

  // Validate every selected SKU before writing any configuration.
  const prepared = [];
  for (const action of actions) {
    const { data, error } = await supabase
      .rpc("monetization_get_sku", {
        app: action.application_id,
        sku: action.sku_id,
      })
      .abortSignal(AbortSignal.timeout(12_000));
    if (error) {
      throw new Error(
        "Could not read the SKU catalog. Check the database and applied migrations.",
      );
    }
    const sku = data as unknown as CatalogSku | null;
    if (
      !sku ||
      sku.application_id !== action.application_id ||
      sku.id !== action.sku_id
    ) {
      throw new Error(
        `SKU ${action.sku_id} is not imported for this application. Run the bot's catalog recovery first.`,
      );
    }
    if (action.grant_action === "grant_plan") {
      if (
        sku.type !== SKUType.Subscription ||
        (sku.flags & SKUFlags.GuildSubscription) === 0
      ) {
        throw new Error(`SKU ${sku.id} must be a guild subscription.`);
      }
    } else if (sku.type !== SKUType.Consumable) {
      throw new Error(`SKU ${sku.id} must be a consumable top-up.`);
    }

    let existing;
    try {
      existing = await getSkuAction(action.application_id, action.sku_id);
    } catch {
      throw new Error(
        `Could not read the existing configuration for SKU ${sku.id}.`,
      );
    }
    if (existing && options.apply && !options.replace) {
      throw new Error(
        `SKU ${sku.id} already has configuration. Review its settings and use --replace to change it.`,
      );
    }
    prepared.push({ name: sku.name, previous: existing, next: action });
  }

  if (options.apply) {
    for (const { next } of prepared) {
      try {
        await upsertSkuAction(next);
      } catch {
        throw new Error(
          `Could not save SKU ${next.sku_id}. Earlier rows may have been saved; review the preview before retrying.`,
        );
      }
    }
  }
  return prepared;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(`Configure imported Discord SKUs for Lerche plans and top-ups.

node --env-file=.env.beta --import tsx supabase/configurePlans.ts \\
  --app APPLICATION_ID --effective-from 2026-12-01T00:00:00Z \\
  --starter SKU_ID --basic SKU_ID --plus SKU_ID

Use real Discord IDs. Omit products you are not configuring.
For a top-up, use --topup SKU_ID --quantity 10000.
The default is a read-only preview of disabled rules.
--apply writes the reviewed rules; --enable enables them.
--replace is required to change an existing rule, including enabling it.
Always retain the intended --effective-from cutoff when changing a rule.`);
    return;
  }

  const options = parsePlanOptions(process.argv.slice(2));
  const prepared = await configurePlans(options);
  console.log(JSON.stringify(prepared, null, 2));
  console.log(
    options.apply
      ? "SKU configuration saved."
      : "Preview only. No configuration was written.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "SKU configuration failed.",
    );
    process.exitCode = 1;
  });
}
