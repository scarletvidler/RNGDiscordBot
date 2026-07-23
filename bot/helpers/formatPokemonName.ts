export default function formatPokemonName(rawName: string): string {
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
