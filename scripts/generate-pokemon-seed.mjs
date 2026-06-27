import fs from "node:fs";
import path from "node:path";

const sourcePath =
  process.argv[2] ?? "C:\\Users\\Scarl\\Downloads\\pokemon.txt";
const outputPath = process.argv[3] ?? "supabase/seeds/pokemon.sql";

const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const pokemon = payload.data?.pokemon;

if (!Array.isArray(pokemon)) {
  throw new Error("Expected payload.data.pokemon to be an array");
}

const sqlString = (value) => {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
};

const sqlNumber = (value) =>
  value === null || value === undefined ? "NULL" : String(value);

const sqlBoolean = (value) => (value ? "TRUE" : "FALSE");

const sqlJson = (value) => {
  if (value === null || value === undefined) return "NULL";
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
};

const cleanFlavorText = (texts) => {
  const flavor = texts?.[0]?.flavor_text;
  if (!flavor) return null;

  return flavor
    .replace(/[\n\f\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const formNameForRow = (baseName, formName) => {
  if (!formName) return baseName;
  if (baseName === formName || baseName.endsWith(`-${formName}`)) {
    return baseName;
  }
  return `${baseName}-${formName}`;
};

const pokemonPokedexId = (form) => {
  if (!form) return null;
  const pokeID = form.pokemon.pokemon_species_id ?? null;
  return pokeID;
};

const pokemonHandle = (pokemonId, formId) =>
  `${String(pokemonId).padStart(4, "0")}-${formId}`;

const rows = pokemon.flatMap((entry) => {
  const specy = entry.pokemonspecy ?? {};
  const dreamSprites = entry.dream?.[0]?.sprites ?? {};
  const officialSprites = entry.official?.[0]?.sprites ?? {};
  const forms = entry.pokemonforms?.length ? entry.pokemonforms : [null];

  return forms.map((form) => {
    const formSprites = form?.pokemonformsprites?.[0] ?? {};
    const formName = form?.form_name || "";

    return {
      handle: pokemonHandle(entry.id, form?.id ?? entry.id),
      pokedex_id: pokemonPokedexId(form),
      form_id: form?.id ?? entry.id,
      name: formNameForRow(entry.name, formName),
      form_name: formName || null,
      height: entry.height,
      weight: entry.weight,
      capture_rate: specy.capture_rate,
      gender_rate: specy.gender_rate,
      is_baby: Boolean(specy.is_baby),
      is_legendary: Boolean(specy.is_legendary),
      is_mythical: Boolean(specy.is_mythical),
      flavor_text: cleanFlavorText(specy.pokemonspeciesflavortexts),
      sprites: {
        back_shiny: formSprites.back_shiny ?? null,
        back_female: formSprites.back_female ?? null,
        front_shiny: formSprites.front_shiny ?? null,
        back_default: formSprites.back_default ?? null,
        front_female: formSprites.front_female ?? null,
        front_default: formSprites.front_default ?? null,
        back_shiny_female: formSprites.back_female_shiny ?? null,
        front_shiny_female: formSprites.front_female_shiny ?? null,
        official_artwork_shiny: officialSprites.front_shiny ?? null,
        official_artwork_default: officialSprites.front_default ?? null,
        dream_sprite_front_default: dreamSprites.front_default ?? null,
        dream_sprite_front_female: dreamSprites.front_female ?? null,
      },
    };
  });
});

const assertUnique = (rowsToCheck, key) => {
  const seen = new Set();
  const duplicates = new Set();

  for (const row of rowsToCheck) {
    if (seen.has(row[key])) {
      duplicates.add(row[key]);
    }
    seen.add(row[key]);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate ${key} values found: ${[...duplicates].slice(0, 10).join(", ")}`,
    );
  }
};

assertUnique(rows, "handle");
assertUnique(rows, "name");

const columns = [
  "handle",
  "pokedex_id",
  "form_id",
  "name",
  "form_name",
  "height",
  "weight",
  "capture_rate",
  "gender_rate",
  "is_baby",
  "is_legendary",
  "is_mythical",
  "flavor_text",
  "sprites",
];

const values = rows.map((row) => {
  return `  (${[
    sqlString(row.handle),
    sqlNumber(row.pokedex_id),
    sqlNumber(row.form_id),
    sqlString(row.name),
    sqlString(row.form_name),
    sqlNumber(row.height),
    sqlNumber(row.weight),
    sqlNumber(row.capture_rate),
    sqlNumber(row.gender_rate),
    sqlBoolean(row.is_baby),
    sqlBoolean(row.is_legendary),
    sqlBoolean(row.is_mythical),
    sqlString(row.flavor_text),
    sqlJson(row.sprites),
  ].join(", ")})`;
});

const sql = `BEGIN;

TRUNCATE TABLE public.pokemon CASCADE;

INSERT INTO public.pokemon (${columns.join(", ")})
VALUES
${values.join(",\n")}
ON CONFLICT (handle) DO UPDATE SET
  pokedex_id = EXCLUDED.pokedex_id,
  form_id = EXCLUDED.form_id,
  name = EXCLUDED.name,
  form_name = EXCLUDED.form_name,
  height = EXCLUDED.height,
  weight = EXCLUDED.weight,
  capture_rate = EXCLUDED.capture_rate,
  gender_rate = EXCLUDED.gender_rate,
  is_baby = EXCLUDED.is_baby,
  is_legendary = EXCLUDED.is_legendary,
  is_mythical = EXCLUDED.is_mythical,
  flavor_text = EXCLUDED.flavor_text,
  sprites = EXCLUDED.sprites;

COMMIT;
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, sql);

const multiFormRows = pokemon.filter(
  (entry) => (entry.pokemonforms ?? []).length > 1,
);
console.log(`Wrote ${rows.length} pokemon rows to ${outputPath}`);
console.log(`Expanded ${multiFormRows.length} pokemon with multiple forms`);
