import { supabase } from "./client";

const COOLDOWN_HOURS = 4;
const SHINY_CHANCE = 0.01;

export const rollPokemon = async (profile) => {
  if (profile.last_rolled_at) {
    const lastRolled = new Date(profile.last_rolled_at);
    const now = new Date();
    const hoursSinceLastRoll = (now - lastRolled) / (1000 * 60 * 60);

    if (hoursSinceLastRoll < COOLDOWN_HOURS) {
      const totalSecondsLeft = Math.ceil(
        (COOLDOWN_HOURS - hoursSinceLastRoll) * 3600,
      );
      const hoursLeft = Math.floor(totalSecondsLeft / 3600);
      const minutesLeft = Math.floor((totalSecondsLeft % 3600) / 60);
      const secondsLeft = totalSecondsLeft % 60;

      return {
        data: null,
        error: `You must wait ${hoursLeft
          .toString()
          .padStart(2, "0")}:${minutesLeft
          .toString()
          .padStart(2, "0")}:${secondsLeft
          .toString()
          .padStart(2, "0")} before rolling again.`,
      };
    }
  }

  const isShiny = Math.random() < SHINY_CHANCE;

  const { data: ownedPokemon, error: ownedPokemonError } = await supabase
    .from("user_pokemon")
    .select("pokemon_id")
    .eq("profile_id", profile.id)
    .eq("shiny", isShiny);

  if (ownedPokemonError) return { data: null, error: ownedPokemonError };

  const ownedPokemonIds = ownedPokemon.map((pokemon) => pokemon.pokemon_id);

  const query = supabase
    .from("pokemon")
    .select(
      "id,name,sprites,pokedex_id,height,weight,flavor_text,capture_rate,legendary,mythical",
    );

  const { data: available, error: availableError } =
    await (ownedPokemonIds.length > 0
      ? query.not("id", "in", `(${ownedPokemonIds.join(",")})`)
      : query);

  if (availableError) return { data: null, error: availableError };

  if (!available?.length)
    return {
      data: null,
      error: "You caught them all!",
    };

  const totalWeight = available.reduce(
    (sum, pokemon) => sum + (pokemon.capture_rate ?? 45),
    0,
  );

  let randomValue = Math.random() * totalWeight;
  let randomPokemon = null;
  for (const pokemon of available) {
    const weight = pokemon.capture_rate ?? 45;
    randomValue -= weight;
    if (randomValue <= 0) {
      randomPokemon = pokemon;
      break;
    }
  }

  if (!randomPokemon) {
    randomPokemon = available[available.length - 1];
  }

  const { error: insertError } = await supabase.from("user_pokemon").insert({
    profile_id: profile.id,
    pokemon_id: randomPokemon.id,
    shiny: isShiny,
  });

  if (insertError) return { data: null, error: insertError };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ last_rolled_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (updateError) return { data: null, error: updateError };

  const spriteUrl = isShiny
    ? randomPokemon.sprites?.front_shiny
    : randomPokemon.sprites?.front_default;

  return {
    data: {
      id: randomPokemon.id,
      name: randomPokemon.name,
      pokedex_id: randomPokemon.pokedex_id,
      sprite: spriteUrl,
      isShiny,
      height: randomPokemon.height,
      weight: randomPokemon.weight,
      flavor_text: randomPokemon.flavor_text,
      capture_rate: randomPokemon.capture_rate,
      legendary: randomPokemon.legendary,
      mythical: randomPokemon.mythical,
    },
    error: null,
  };
};

export const getUserPokemon = async (profile) => {
  const { data, error } = await supabase
    .from("user_pokemon")
    .select("id, shiny, pokemon(name,sprites,pokedex_id)")
    .eq("profile_id", profile.id);

  if (error) return { data: null, error };

  const formattedData = data.map((item) => {
    const spriteUrl = item.shiny
      ? item.pokemon?.sprites?.front_shiny
      : item.pokemon?.sprites?.front_default;

    return {
      id: item.id,
      name: item.pokemon?.name,
      sprite: spriteUrl,
      pokedex_id: item.pokemon?.pokedex_id,
      isShiny: item.shiny,
    };
  });

  return { data: formattedData, error: null };
};

// logic to keep rolling/being able to roll the shiny version of what you have - sort of done maybe?
// roster - ehh
// differentiate and show both or one (most likely shiny) on the roster - ehh
