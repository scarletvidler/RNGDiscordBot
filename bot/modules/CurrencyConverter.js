class CurrencyConverter {
  fromCurrency;
  toCurrency;
  constructor(fromCurrency, toCurrency) {
    this.fromCurrency = fromCurrency || "USD";
    this.toCurrency = toCurrency || "USD";
  }
  async convert(amount) {
    try {
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/YOUR-API-KEY/pair/${this.fromCurrency}/${this.toCurrency}`
      );
      const data = await response.json();
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
