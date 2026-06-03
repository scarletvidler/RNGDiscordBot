import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { rollPokemon } from "../../supabase/pokemon.ts";
import { getUserProfile } from "../../supabase/profiles.js";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Replies with a random Pokémon!"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    try {
      const { data: profile, error: profileError } = await getUserProfile(
        interaction.user.id,
        interaction.guildId!,
      );

      if (profileError || !profile) {
        await interaction.editReply(
          "Failed to retrieve user profile. Please try again.",
        );
        return;
      }

      const { pokemon, status, message } = await rollPokemon(profile);

      if (status === "error") {
        await interaction.editReply(`${message}`);
        return;
      }

      if (status === "cooldown") {
        await interaction.editReply(`${message}`);
        return;
      }

      if (!pokemon) {
        await interaction.editReply("Error rolling Pokémon. Please try again.");
        return;
      }

      const speciesResponse = await fetch(
        `https://pokeapi.co/api/v2/pokemon-species/${pokemon.pokedex_id}`,
      );
      const pokemonResponse = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${pokemon.pokedex_id}`,
      );

      if (!speciesResponse.ok || !pokemonResponse.ok) {
        await interaction.editReply(
          "Failed to retrieve Pokémon data. Please try again.",
        );
        return;
      }
      const speciesData = await speciesResponse.json();
      const pokemonData = await pokemonResponse.json();
      const pokemonType = pokemonData.types[0].type.name;
      const pokemonWeight = pokemonData.weight / 10; // Convert to kg
      const pokemonHeight = pokemonData.height / 10;
      const captureRate = speciesData.capture_rate / 255; // Normalise as a percentage
      let rarity = "Unknown";

      switch (true) {
        case captureRate >= 0.5:
          rarity = "Common";
          break;
        case captureRate >= 0.25:
          rarity = "Uncommon";
          break;
        case captureRate >= 0.1:
          rarity = "Rare";
          break;
        case captureRate >= 0.05:
          rarity = "Epic";
          break;
        default:
          rarity = "Legendary";
      }

      const embedColor = getEmbedColour(pokemonType);

      const embed = [
        {
          title: `A wild **${pokemon.name}** appeared!`,
          color: embedColor,
          image: {
            url: pokemon.sprite,
          },
          fields: [
            {
              name: "Type",
              value: pokemonType,
              inline: true,
            },
            {
              name: "Height",
              value: `${pokemonHeight} m`,
              inline: true,
            },
            {
              name: "Weight",
              value: `${pokemonWeight} kg`,
              inline: true,
            },
            {
              name: "Rarity",
              value: rarity,
              inline: false,
            },
          ],
          footer: {
            text: `No #${String(pokemon.pokedex_id).padStart(3, "0")}`,
            icon_url:
              "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png",
          },
        },
      ];

      await interaction.editReply({
        embeds: embed,
      });
    } catch (error) {
      console.error("Error executing roll command:", error);
      await interaction.editReply(
        "An unexpected error occurred while rolling for a Pokémon. Please try again.",
      );
    }
  },
};

function getEmbedColour(type: string): number {
  let embedColor: number;
  switch (type.toLowerCase()) {
    case "fire":
      embedColor = 0xff4500; // OrangeRed
      break;
    case "water":
      embedColor = 0x1e90ff; // DodgerBlue
      break;
    case "grass":
      embedColor = 0x32cd32; // LimeGreen
      break;
    case "electric":
      embedColor = 0xffff00; // Yellow
      break;
    case "psychic":
      embedColor = 0xff69b4; // HotPink
      break;
    case "ice":
      embedColor = 0x00ffff; // Cyan
      break;
    case "dragon":
      embedColor = 0x8a2be2; // BlueViolet
      break;
    case "dark":
      embedColor = 0xa9a9a9; // DarkGray
      break;
    case "fairy":
      embedColor = 0xffb6c1; // LightPink
      break;
    default:
      embedColor = 0x0099ff; // Default Blue
  }
  return embedColor;
}

export default command;
