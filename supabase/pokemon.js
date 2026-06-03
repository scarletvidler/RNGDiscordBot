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
  const { data: ownedPokemon, error: ownedPokemonError } = await supabase
    .from("user_pokemon")
    .select("pokemon_id")
    .eq("profile_id", profile.id);

  if (ownedPokemonError) return { data: null, error: ownedPokemonError };

  const ownedPokemonIds = ownedPokemon.map((pokemon) => pokemon.pokemon_id);

  const query = supabase
    .from("pokemon")
    .select("id,name,sprite,sprite_shiny,pokedex_id");

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

  const randomPokemon = available[Math.floor(Math.random() * available.length)];

  const isShiny = Math.random() < SHINY_CHANCE;

  const { data, error: insertError } = await supabase
    .from("user_pokemon")
    .insert({
      profile_id: profile.id,
      pokemon_id: randomPokemon.id,
      shiny: isShiny,
    })
    .select("*");

  if (insertError) return { data: null, error: insertError };
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ last_rolled_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (updateError) return { data: null, error: updateError };

  return {
    data: {
      ...randomPokemon,
      sprite: isShiny ? randomPokemon.sprite_shiny : randomPokemon.sprite,
      isShiny,
    },
    error: null,
  };
};

export const getUserPokemon = async (profile) => {
  const { data, error } = await supabase
    .from("user_pokemon")
    .select("id, shiny, pokemon(name,sprite,sprite_shiny,pokedex_id)")
    .eq("profile_id", profile.id);

  if (error) return { data: null, error };

  const formattedData = data.map((item) => ({
    id: item.id,
    name: item.pokemon?.name,
    sprite: item.shiny ? item.pokemon?.sprite_shiny : item.pokemon?.sprite,
    pokedex_id: item.pokemon?.pokedex_id,
    isShiny: item.shiny,
  }));

  return { data: formattedData, error: null };
};
