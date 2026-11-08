import { Pool, type PoolConfig } from "pg";

export interface SkuSnapshot {
  applicationId: string;
  id: string;
  name: string;
  type: 2 | 3 | 5;
  flags: number;
  observedAt: string;
}
export interface SubscriptionSnapshot {
  applicationId: string;
  id: string;
  userId: string;
  skuIds: string[];
  entitlementIds: string[];
  renewalSkuIds: string[] | null;
  status: 0 | 1 | 2;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  createdAt: string;
  observedAt: string;
  deleted: boolean;
}
export interface EntitlementSnapshot {
  applicationId: string;
  id: string;
  skuId: string;
  userId: string | null;
  guildId: string | null;
  type: number;
  startsAt: string | null;
  endsAt: string | null;
  consumed: boolean;
  deleted: boolean;
  createdAt: string;
  observedAt: string;
}
export interface MonetizationStore {
  upsertSkus(skus: SkuSnapshot[]): Promise<void>;
  applySubscription(snapshot: SubscriptionSnapshot): Promise<void>;
  applyEntitlement(snapshot: EntitlementSnapshot): Promise<void>;
  listKnownPurchasers(
    applicationId: string,
    after?: string,
    limit?: number,
  ): Promise<string[]>;
}

/** The private schema is deliberately outside the Supabase Data API schema types. */
export interface PurchaseRecord {
  application_id: string;
  id: string;
  purchaser_discord_id: string | null;
  discord_user_id: string | null;
  title: string;
  created_at: string;
  observed_at: string;
  deleted: boolean;
}
export interface SubscriptionRecord extends PurchaseRecord {
  status: 0 | 1 | 2;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
  entitlement_ids: string[];
  renewal_sku_ids: string[] | null;
  items: Array<{ sku_id: string; title: string; is_current: boolean }>;
}
export interface OneTimePurchaseRecord extends PurchaseRecord {
  entitlement_id: string;
  sku_id: string;
  guild_id: string | null;
  beneficiary_discord_id: string | null;
  kind: "durable" | "consumable";
  consumed: boolean;
}
export interface RecordFilter {
  applicationId: string;
  userId?: string;
  guildId?: string;
  after?: string;
  limit?: number;
}
export interface MonetizationReader {
  listSubscriptions(filter: RecordFilter): Promise<SubscriptionRecord[]>;
  listOneTimePurchases(filter: RecordFilter): Promise<OneTimePurchaseRecord[]>;
}
export interface QueryClient {
  query(
    text: string,
    values: unknown[],
  ): Promise<{ rows: Array<{ result: unknown }> }>;
}

const snowflake = /^[0-9]{1,20}$/;
function id(value: string): void {
  if (!snowflake.test(value)) throw new Error("Invalid Discord identifier");
}
function timestamp(value: string | null): void {
  if (
    value !== null &&
    (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))
  ) {
    throw new Error("Invalid timestamp");
  }
}
function page(after: string | undefined, limit: number): void {
  if (after !== undefined && (after.length > 128 || after.length === 0))
    throw new Error("Invalid cursor");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid page size");
}
function base(value: {
  applicationId: string;
  id: string;
  observedAt: string;
}): void {
  id(value.applicationId);
  id(value.id);
  timestamp(value.observedAt);
}
/** Injectable query boundary keeps automated tests off live Supabase. */
export function createMonetizationModels(
  client: QueryClient,
): MonetizationStore & MonetizationReader {
  async function call<T>(name: string, args: unknown[]): Promise<T> {
    // Names are internal constants below; all values remain SQL parameters.
    const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
    const response = await client.query(
      `select monetization.${name}(${placeholders}) as result`,
      args,
    );
    return response.rows[0]?.result as T;
  }
  async function read<T>(kind: string, filter: RecordFilter): Promise<T[]> {
    id(filter.applicationId);
    if (filter.userId) id(filter.userId);
    if (filter.guildId) id(filter.guildId);
    page(filter.after, filter.limit ?? 100);
    return call<T[]>("read_records", [
      kind,
      filter.applicationId,
      filter.userId ?? null,
      filter.guildId ?? null,
      filter.after ?? null,
      filter.limit ?? 100,
    ]);
  }
  return {
    async upsertSkus(skus) {
      if (skus.length > 100) throw new Error("SKU batch exceeds limit");
      for (const sku of skus) {
        base(sku);
        if (
          ![2, 3, 5].includes(sku.type) ||
          !sku.name.trim() ||
          sku.name.length > 512 ||
          !Number.isSafeInteger(sku.flags) ||
          sku.flags < 0
        )
          throw new Error("Invalid SKU");
      }
      await call("upsert_skus", [JSON.stringify(skus)]);
    },
    async applySubscription(snapshot) {
      base(snapshot);
      id(snapshot.userId);
      if (
        ![0, 1, 2].includes(snapshot.status) ||
        snapshot.skuIds.length === 0 ||
        snapshot.skuIds.length > 100
      )
        throw new Error("Invalid subscription");
      for (const value of [
        ...snapshot.skuIds,
        ...snapshot.entitlementIds,
        ...(snapshot.renewalSkuIds ?? []),
      ])
        id(value);
      for (const value of [
        snapshot.currentPeriodStart,
        snapshot.currentPeriodEnd,
        snapshot.canceledAt,
        snapshot.createdAt,
      ])
        timestamp(value);
      if (
        Date.parse(snapshot.currentPeriodEnd) <
        Date.parse(snapshot.currentPeriodStart)
      )
        throw new Error("Invalid subscription period");
      await call("apply_subscription", [JSON.stringify(snapshot)]);
    },
    async applyEntitlement(snapshot) {
      base(snapshot);
      id(snapshot.skuId);
      if (snapshot.userId !== null) id(snapshot.userId);
      if (snapshot.guildId !== null) id(snapshot.guildId);
      if (snapshot.userId === null && snapshot.guildId === null)
        throw new Error("Entitlement requires a beneficiary");
      if (
        !Number.isInteger(snapshot.type) ||
        snapshot.type < 1 ||
        snapshot.type > 255
      )
        throw new Error("Invalid entitlement type");
      for (const value of [
        snapshot.startsAt,
        snapshot.endsAt,
        snapshot.createdAt,
      ])
        timestamp(value);
      await call("apply_entitlement", [JSON.stringify(snapshot)]);
    },
    async listKnownPurchasers(applicationId, after, limit = 100) {
      id(applicationId);
      page(after, limit);
      return call("known_purchasers", [applicationId, after ?? null, limit]);
    },
    listSubscriptions: (filter) =>
      read<SubscriptionRecord>("subscriptions", filter),
    listOneTimePurchases: (filter) =>
      read<OneTimePurchaseRecord>("one_time_purchases", filter),
  };
}

export function monetizationConnectionConfig(
  connectionString: string,
): PoolConfig {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Invalid monetization database URL");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    ["postgres", "service_role", "supabase_admin", "authenticator"].includes(
      decodeURIComponent(url.username),
    )
  )
    throw new Error("Use a dedicated monetization database login");
  // Never pass the URL to pg: query parameters can override host, SSL and timeouts.
  if ([...url.searchParams.keys()].some((key) => key !== "sslmode"))
    throw new Error("Unsupported database URL parameter");
  const sslmode = url.searchParams.get("sslmode");
  if (
    sslmode &&
    !["verify-full", "require", ...(local ? ["disable"] : [])].includes(sslmode)
  )
    throw new Error("Insecure database TLS mode");
  const config: PoolConfig = {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    max: 3,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    ssl: local ? false : { rejectUnauthorized: true },
    application_name: "lerche-monetization",
  };
  return config;
}

export async function assertMonetizationLogin(
  client: QueryClient,
): Promise<void> {
  const response = await client.query(
    `select (
    not r.rolsuper and not r.rolbypassrls
    and pg_has_role(session_user, 'monetization_writer', 'member')
    and not has_schema_privilege(session_user, 'monetization', 'create')
    and not exists (
      select from pg_tables t where t.schemaname='monetization'
      and has_table_privilege(session_user, format('%I.%I',t.schemaname,t.tablename), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    )
  ) as result from pg_roles r where r.rolname=session_user`,
    [],
  );
  if (response.rows[0]?.result !== true)
    throw new Error(
      "Monetization login must have only restricted writer access",
    );
}

/** Coalesce login checks, but let a later operation recover after a connection failure. */
export function createRestrictedQueryClient(client: QueryClient): QueryClient {
  let loginCheck: Promise<void> | undefined;
  return {
    async query(text, values) {
      loginCheck ??= assertMonetizationLogin(client).catch((error: unknown) => {
        loginCheck = undefined;
        throw error;
      });
      await loginCheck;
      return client.query(text, values);
    },
  };
}

let pool: Pool | undefined;
let restrictedClient: QueryClient | undefined;
export function createMonetizationStore(
  connectionString = process.env.DISCORD_MONETIZATION_DATABASE_URL,
): MonetizationStore & MonetizationReader {
  if (!connectionString)
    throw new Error("DISCORD_MONETIZATION_DATABASE_URL is required");
  if (!pool) {
    pool = new Pool(monetizationConnectionConfig(connectionString));
    pool.on("error", () =>
      console.error("Monetization database idle connection failed"),
    );
    restrictedClient = createRestrictedQueryClient(pool as QueryClient);
  }
  return createMonetizationModels(restrictedClient!);
}
export async function closeMonetizationStore(): Promise<void> {
  const previous = pool;
  pool = undefined;
  restrictedClient = undefined;
  await previous?.end();
}
