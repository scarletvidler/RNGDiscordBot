import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import CurrencyConverter from "../modules/CurrencyConverter.js";
import type { BotCommand } from "../types.js";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("convert")
    .setDescription("Converts an amount from one currency to another")
    .addNumberOption((option) =>
      option
        .setName("amount")
        .setDescription("The amount of currency to convert")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("from")
        .setDescription("The currency code to convert from (e.g., USD)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("to")
        .setDescription("The currency code to convert to (e.g., EUR)")
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const amount = interaction.options.getNumber("amount", true);
    const fromCurrency = interaction.options.getString("from", true).toUpperCase();
    const toCurrency = interaction.options.getString("to", true).toUpperCase();
    const conversion = new CurrencyConverter(fromCurrency, toCurrency);
    const data = await conversion.convert(amount);
    await interaction.editReply({
      content: `${amount} ${fromCurrency} is approximately ${data} ${toCurrency}.`,
    });
  },
};

export default command;
