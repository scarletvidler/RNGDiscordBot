import assert from "node:assert/strict";
import test from "node:test";
import { getGuildPlanAccess } from "../../../bot/modules/planAccess.ts";
import { invalidateGuildFeatures } from "../../../bot/modules/featureCheck.ts";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import type { GuildTokenState } from "../../../supabase/models/guildTokens.ts";

test("plan access preserves explicit legacy guilds and gates new or expired guilds", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const db = getSupabaseAdmin()!;
  const state: GuildTokenState = {
    id: "500",
    token_limit: 5000,
    token_total_usage: 0,
    token_balance: 5000,
    has_active_subscription: false,
    managed_plan: false,
    legacy_features: true,
    reserved_tokens: 0,
  };
  let features: string[] = [];
  let readFailure = false;
  let featureReads = 0;
  t.mock.method(db, "rpc", (name: string, args: unknown) => ({
    abortSignal: async () => {
      if (name === "monetization_get_guild_token_state") {
        assert.deepEqual(args, { guild: "500" });
        return {
          data: state,
          error: readFailure ? new Error("unavailable") : null,
        };
      }
      assert.equal(name, "monetization_get_granted_features");
      assert.deepEqual(args, {
        app: "100",
        target_type: "guild",
        target_id: "500",
      });
      featureReads++;
      return { data: features, error: null };
    },
  }));

  assert.deepEqual(await getGuildPlanAccess("100", "500"), {
    emotionTags: true,
    voiceSelection: true,
    higherVoiceModules: true,
  });
  assert.equal(featureReads, 0);
  state.legacy_features = false;
  assert.deepEqual(await getGuildPlanAccess("100", "500"), {
    emotionTags: false,
    voiceSelection: false,
    higherVoiceModules: false,
  });
  assert.equal(featureReads, 1);
  state.managed_plan = true;
  features = ["emotion_tags", "voice_selection", "higher_voice_modules"];
  invalidateGuildFeatures("100", "500");
  assert.deepEqual(await getGuildPlanAccess("100", "500"), {
    emotionTags: true,
    voiceSelection: true,
    higherVoiceModules: true,
  });
  features = [];
  invalidateGuildFeatures("100", "500");
  assert.equal((await getGuildPlanAccess("100", "500")).voiceSelection, false);
  readFailure = true;
  await assert.rejects(getGuildPlanAccess("100", "500"), /unavailable/);
  await assert.rejects(
    getGuildPlanAccess("100", "501", state),
    /scope mismatch/,
  );
});
