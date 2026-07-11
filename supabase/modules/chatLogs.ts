import type { Message } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";

export async function insertGuildChatLog(input: {
  message: Message<boolean>;
  spokenMessage: string;
  ttsMode: "channel" | "room_prefix";
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !input.message.guildId) return;

  const { error } = await supabase.from("guild_chat_logs").insert({
    guild_id: input.message.guildId,
    channel_id: input.message.channelId,
    voice_channel_id: input.message.member?.voice.channelId ?? null,
    user_id: input.message.author.id,
    message_id: input.message.id,
    raw_message: input.message.content,
    spoken_message: input.spokenMessage,
    tts_mode: input.ttsMode,
  });

  if (error) throw error;
}
