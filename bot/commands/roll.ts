import {
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types.ts";
import { rollPokemon } from "../../supabase/pokemon.ts";
import { getUserProfile } from "../../supabase/profiles.ts";

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

function formatPokemonName(rawName: string): string {
  if (!rawName) return "";

  const lower = rawName.toLowerCase();

  // 1. Handle native, non-form hyphenated names directly
  const exceptions: Record<string, string> = {
    "ho-oh": "Ho-Oh",
    "porygon-z": "Porygon-Z",
    "mr-mime": "Mr. Mime",
    "mime-jr": "Mime Jr.",
    "type-null": "Type: Null",
    "jangmo-o": "Jangmo-o",
    "hakamo-o": "Hakamo-o",
    "kommo-o": "Kommo-o",
    "wo-chien": "Wo-Chien",
    "chien-pao": "Chien-Pao",
    "ting-lu": "Ting-Lu",
    "chi-yu": "Chi-Yu",
    "great-tusk": "Great Tusk",
    "scream-tail": "Scream Tail",
    "brute-bonnet": "Brute Bonnet",
    "flutter-mane": "Flutter Mane",
    "slither-wing": "Slither Wing",
    "sandy-shocks": "Sandy Shocks",
    "iron-treads": "Iron Treads",
    "iron-moth": "Iron Moth",
    "iron-hands": "Iron Hands",
    "iron-jugulis": "Iron Jugulis",
    "iron-thorns": "Iron Thorns",
    "iron-bundle": "Iron Bundle",
    "iron-valiant": "Iron Valiant",
    "roaring-moon": "Roaring Moon",
    "walking-wake": "Walking Wake",
    "iron-leaves": "Iron Leaves",
    "gouging-fire": "Gouging Fire",
    "raging-bolt": "Raging Bolt",
    "iron-boulder": "Iron Boulder",
    "iron-crown": "Iron Crown",
  };

  if (exceptions[lower]) {
    return exceptions[lower];
  }

  // 2. Handle Tapu guardian deity names (e.g. tapu-koko -> Tapu Koko)
  if (lower.startsWith("tapu-")) {
    const parts = lower.split("-");
    return `Tapu ${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)}`;
  }

  const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  // 3. Format forms cleanly: split by hyphen and wrap the form in parentheses
  const parts = lower.split("-");
  if (parts.length > 1) {
    const base = capitalize(parts[0]);
    const form = parts.slice(1).map(capitalize).join(" ");
    return `${base} (${form})`;
  }

  return capitalize(lower);
}

export default command;
