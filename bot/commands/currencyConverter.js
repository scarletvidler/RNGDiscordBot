import { SlashCommandBuilder } from "discord.js";
import CurrencyConverter from "../modules/CurrencyConverter.js";

export default {
  data: new SlashCommandBuilder()
    .setName("convert")
    .setDescription("Converts an amount from one currency to another"),
  async execute(interaction) {
    await interaction.deferReply();
    const conversion = new CurrencyConverter("USD", "EUR");
    const convertedAmount = await conversion.convert(100);
    const data = await convertedAmount;
    await interaction.editReply({
      embeds: [
        {
          title: "Currency Conversion",
          description: `100 USD is approximately ${data} EUR.`,
          color: 0x0099ff,
        },
      ],
    });
  },
};
