import {
  getGuildTokenState,
  type GuildTokenState,
} from "../../supabase/models/guildTokens.ts";
import { guildHasFeature } from "./featureCheck.ts";

export interface PlanAccess {
  emotionTags: boolean;
  voiceSelection: boolean;
  higherVoiceModules: boolean;
}

export async function getGuildPlanAccess(
  applicationId: string,
  guildId: string,
  state?: GuildTokenState,
): Promise<PlanAccess> {
  if (!applicationId || !guildId)
    throw new Error("Missing guild feature scope");
  const guildState = state ?? (await getGuildTokenState(guildId));
  if (!guildState) throw new Error("Guild token state was not found");
  if (guildState.id !== guildId)
    throw new Error("Guild token state scope mismatch");
  if (guildState.legacy_features) {
    return {
      emotionTags: true,
      voiceSelection: true,
      higherVoiceModules: true,
    };
  }

  const [emotionTags, voiceSelection, higherVoiceModules] = await Promise.all([
    guildHasFeature(applicationId, guildId, "emotion_tags"),
    guildHasFeature(applicationId, guildId, "voice_selection"),
    guildHasFeature(applicationId, guildId, "higher_voice_modules"),
  ]);
  return { emotionTags, voiceSelection, higherVoiceModules };
}
