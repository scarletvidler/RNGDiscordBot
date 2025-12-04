import { SlashCommandBuilder } from "discord.js";
import CurrencyConverter from "../modules/CurrencyConverter.js";

export default {
  data: new SlashCommandBuilder()
    .setName("convert")
    .setDescription("Converts an amount from one currency to another")
    .addNumberOption((option) =>
      option
        .setName("amount")
        .setDescription("The amount of currency to convert")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("from")
        .setDescription("The currency code to convert from (e.g., USD)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("to")
        .setDescription("The currency code to convert to (e.g., EUR)")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const amount = interaction.options.getNumber("amount");
    const fromCurrency = interaction.options.getString("from").toUpperCase();
    const toCurrency = interaction.options.getString("to").toUpperCase();
    const conversion = new CurrencyConverter(fromCurrency, toCurrency);
    const convertedAmount = await conversion.convert(amount);
    const data = await convertedAmount;
    await interaction.editReply({
      content: `${amount} ${fromCurrency} is approximately ${data} ${toCurrency}.`,
    });
  },
};
