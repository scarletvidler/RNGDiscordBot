import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { rollPokemon } from "../../supabase/pokemon.js";
import { getUserProfile } from "../../supabase/profiles.js";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Replies with a random Pokémon!"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const { data: profile, error: profileError } = await getUserProfile(
      interaction.user.id,
      interaction.guildId!,
    );

    if (profileError || !profile) {
      await interaction.editReply("Something went wrong. Please try again.");
      return;
    }

    const { data: pokemon, error: rollError } = await rollPokemon(profile);

    if (rollError) {
      await interaction.editReply(`${rollError}`);
      return;
    }

    if (!pokemon) {
      await interaction.editReply("Something went wrong. Please try again.");
      return;
    }

    const embed = [
      {
        title: `A wild **${pokemon.name}** appeared!`,
        color: 0x0099ff,
        image: {
          url: pokemon.sprite,
        },
        footer: {
          text: `#${String(pokemon.pokedex_id).padStart(3, "0")}`,
        },
      },
    ];

    await interaction.editReply({
      embeds: embed,
    });
  },
};

export default command;
