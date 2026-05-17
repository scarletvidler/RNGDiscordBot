import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.js";

interface PokemonData {
  name: string;
  height: number;
  weight: number;
  sprites: {
    front_default: string;
  };
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("poki")
    .setDescription("Replies with a random Pokémon!"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const reply = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${Math.floor(Math.random() * 505) + 1}`,
    );
    const data = (await reply.json()) as PokemonData;
    const embed = [
        {
          title: `A wild **${data.name}** appeared!`,
          color: 0x0099ff,
          description: `Height: ${data.height / 10} m\nWeight: ${data.weight / 10} kg`,
          image: {
            url: data.sprites.front_default,
          },
          footer: {
            text: "Data from Lerche API",
          },
        },
      ]


    await interaction.editReply({
      embeds: embed,
    });
  },
};

export default command;
