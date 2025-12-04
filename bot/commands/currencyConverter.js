import { SlashCommandBuilder } from "discord.js";
import CurrencyConverter from "../modules/CurrencyConvert";

export default {
  data: new SlashCommandBuilder()
    .setName("cconvert")
    .setDescription("Converts an amount from one currency to another"),
  async execute(interaction) {
    await interaction.deferReply();
    const conversion = new CurrencyConverter("USD", "EUR");
    const convertedAmount = await conversion.convert(100);
    await interaction.editReply({
      embeds: [
        {
          title: "Currency Conversion",
          description: `100 USD is approximately ${convertedAmount} EUR.`,
          color: 0x0099ff,
        },
      ],
    });
  },
};
