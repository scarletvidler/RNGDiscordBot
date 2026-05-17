interface ExchangeRateResponse {
  conversion_rate: number;
}

class CurrencyConverter {
  fromCurrency: string;
  toCurrency: string;

  constructor(fromCurrency: string, toCurrency: string) {
    this.fromCurrency = fromCurrency || "USD";
    this.toCurrency = toCurrency || "USD";
  }

  async convert(amount: number): Promise<string> {
    try {
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/21498dca16e786c432c72dd7/pair/${this.fromCurrency}/${this.toCurrency}`,
      );
      const data = (await response.json()) as ExchangeRateResponse;
      console.log(data);
      const conversionAmount = data.conversion_rate * amount;
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: this.toCurrency,
      }).format(conversionAmount);
    } catch (error) {
      console.error("Error converting currency:", error);
      throw error;
    }
  }
}

export default CurrencyConverter;
