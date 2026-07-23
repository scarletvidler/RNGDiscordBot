// Add the basic command operation
// This should NOT handle any function or logic
// This should act as a "route" / "controller" only.

import {
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types.ts";
import { rollPokemon } from "../../supabase/pokemon.ts";
getUserProfile;
import formatPokemonName from "../helpers/formatPokemonName.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Replies with a random Pokémon!")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const { data: profile, error: profileError } = await getUserProfile(
      interaction.user.id,
      interaction.user.username,
      interaction.guildId!,
      interaction.guild?.name ?? "Unknown Server",
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

    if (!pokemon || typeof pokemon === "boolean") {
      await interaction.editReply("Something went wrong. Please try again.");
      return;
    }

    const formattedName = formatPokemonName(pokemon.name);

    let prefix = "A wild";
    if (pokemon.isShiny) prefix = "✨ A wild Shiny";
    else if (pokemon.mythical) prefix = "🌀 A wild Mythical";
    else if (pokemon.legendary) prefix = "👑 A wild Legendary";

    let embedColor = 0x0099ff; // Standard Blue
    if (pokemon.isShiny)
      embedColor = 0xffd700; // Gold
    else if (pokemon.mythical)
      embedColor = 0xa335ee; // Purple
    else if (pokemon.legendary) embedColor = 0xff8000; // Orange

    const formattedHeight = pokemon.height
      ? `${(pokemon.height / 10).toFixed(1)}m`
      : "N/A";
    const formattedWeight = pokemon.weight
      ? `${(pokemon.weight / 10).toFixed(1)}kg`
      : "N/A";

    const fields = [
      { name: "Height", value: formattedHeight, inline: true },
      { name: "Weight", value: formattedWeight, inline: true },
    ];

    if (pokemon.capture_rate !== null) {
      fields.push({
        name: "Capture Rate",
        value: `${String(pokemon.capture_rate)} (0-255)`,
        inline: true,
      });
    }

    const embed: any = {
      title: `${prefix} **${formattedName}** appeared!`,
      description:
        pokemon.flavor_text || "*No Pokédex entry found for this species.*",
      color: embedColor,
      fields: fields,
      footer: {
        text: `#${String(pokemon.pokedex_id).padStart(3, "0")}`,
      },
    };

    if (pokemon.sprite) {
      embed.image = { url: pokemon.sprite };
    }

    await interaction.editReply({
      embeds: [embed],
    });
  },
};

export default command;
