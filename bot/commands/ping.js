import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("poki")
    .setDescription("Replies with a random Pokémon!"),
  async execute(interaction) {
    await interaction.deferReply();
    const reply = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${
        Math.floor(Math.random() * 1010) + 1
      }`
    );
    // Get the body as text
    const data = await reply.json();
    //  Reply with an embedded message with the Pokémon's name and image
    await interaction.editReply({
      embeds: [
        {
          title: `A wild **${data.name}** appeared!`,
          image: {
            url: data.sprites.front_default,
          },
        },
      ],
    });
  },
};
