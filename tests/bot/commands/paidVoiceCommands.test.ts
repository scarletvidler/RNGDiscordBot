import assert from "node:assert/strict";
import test from "node:test";
import defaultVoice from "../../../bot/commands/config-default-voice.ts";
import personalVoice from "../../../bot/commands/personal-set-my-voice.ts";
import ElevenLabs from "../../../bot/modules/ElevenLabs.ts";
import FishAudio from "../../../bot/modules/FishAudio.ts";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import { invalidateGuildFeatures } from "../../../bot/modules/featureCheck.ts";
import { TTSModels } from "../../../bot/types.ts";

test("voice commands deny unavailable benefits before provider calls or setting writes", async (t) => {
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
  let features: string[] = [];
  t.mock.method(db, "rpc", (name: string) => ({
    abortSignal: async () => ({
      data:
        name === "monetization_get_guild_token_state"
          ? { id: "500", legacy_features: false, managed_plan: true }
          : features,
      error: null,
    }),
  }));
  t.mock.method(db, "from", () => {
    throw new Error("Unexpected setting write");
  });
  t.mock.method(ElevenLabs, "getInstance", () => {
    throw new Error("Unexpected provider call");
  });
  t.mock.method(FishAudio, "getInstance", () => {
    throw new Error("Unexpected provider call");
  });
  let selectedModel = TTSModels.ElevenLabsV3;
  const replies: string[] = [];
  const interaction = {
    applicationId: "100",
    guildId: "500",
    deferReply: async () => {},
    editReply: async (text: string) => {
      replies.push(text);
    },
    options: {
      getString: (name: string) =>
        name === "voice-id" ? "custom-voice" : selectedModel,
    },
  };
  const execute = (command: typeof defaultVoice) =>
    command.execute(
      interaction as unknown as Parameters<typeof command.execute>[0],
      {} as Parameters<typeof command.execute>[1],
      { id: "500" } as Parameters<typeof command.execute>[2],
    );
  await execute(defaultVoice);
  assert.match(replies.at(-1)!, /Higher Voice Modules/);
  selectedModel = TTSModels.ElevenLabsFlashV2_5;
  await execute(defaultVoice);
  assert.match(replies.at(-1)!, /voice selection/);
  await execute(personalVoice);
  assert.match(replies.at(-1)!, /voice selection/);
  features = ["voice_selection"];
  invalidateGuildFeatures("100", "500");
  selectedModel = TTSModels.FishPro;
  await execute(personalVoice);
  assert.match(replies.at(-1)!, /Higher Voice Modules/);
});
