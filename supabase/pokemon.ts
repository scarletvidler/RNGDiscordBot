import { supabase } from "./client";

const COOLDOWN_HOURS = 4;
const SHINY_CHANCE = 0.01;

type statusType = "success" | "cooldown" | "error" | "caught_all" | "";

type RollPokemonResult = {
  pokemon: Pokemon | null;
  status: statusType;
  message: string;
};

type Pokemon = {
  id: number;
  name: string;
  sprite: string;
  pokedex_id: number;
  isShiny: boolean;
};

export const rollPokemon = async (profile): Promise<RollPokemonResult> => {
  console.log("Rolling for Pokémon with profile:", profile);

  const result: RollPokemonResult = {
    pokemon: null,
    status: "",
    message: "",
  };

  const cooldown = cooldownCheck(profile);
  // if dev mode is enabled, skip cooldown check
  if (process.env.DEV_MODE === "true") {
    console.log("DEV_MODE is enabled, skipping cooldown check.");
  } else if (cooldown.status === "cooldown") {
    return { ...result, ...cooldown };
  }

  const { data: ownedPokemon, error: ownedPokemonError } = await supabase
    .from("user_pokemon")
    .select("pokemon_id")
    .eq("profile_id", profile.id);

  if (ownedPokemonError) {
    result.status = "error";
    result.message = "Failed to retrieve owned Pokémon. Please try again.";
    return result;
  }

  const ownedPokemonIds: number[] =
    ownedPokemon?.map((pokemon) => pokemon.pokemon_id) || [];

  const query = supabase
    .from("pokemon")
    .select("id,name,sprite,sprite_shiny,pokedex_id");
  if (ownedPokemonIds.length > 0) {
    query.not("id", "in", `(${ownedPokemonIds.join(",")})`);
  }

  const { data: available, error: availableError } = await query;
  if (availableError) {
    result.status = "error";
    result.message = "Failed to retrieve available Pokémon. Please try again.";
    return result;
  }

  if (!available?.length || available.length === 0) {
    result.status = "caught_all";
    result.message = "Congratulations! You've caught all available Pokémon!";
    return result;
  }

  if (!available) {
    result.status = "error";
    result.message = "No Pokémon available to roll. Please try again later.";
    return result;
  } else {
    const randomPokemon =
      available[Math.floor(Math.random() * available.length)];
    const isShiny = Math.random() < SHINY_CHANCE;

    const { error: insertError } = await supabase
      .from("user_pokemon")
      .insert({
        profile_id: profile.id,
        pokemon_id: randomPokemon.id,
        shiny: isShiny,
      })
      .select("*");

    if (insertError) {
      result.status = "error";
      result.message = "Failed to catch the Pokémon. Please try again.";
    } else {
      result.pokemon = {
        id: randomPokemon.id,
        name: randomPokemon.name,
        sprite: isShiny ? randomPokemon.sprite_shiny : randomPokemon.sprite,
        pokedex_id: randomPokemon.pokedex_id,
        isShiny,
      };
      result.status = "success";
      result.message = `You caught a ${isShiny ? "shiny " : ""}${
        randomPokemon.name
      }!`;
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_rolled_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (updateError) {
      result.status = "error";
      result.message = "Failed to update roll timestamp. Please try again.";
    }

    return result;
  }
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

function cooldownCheck(profile): { status: statusType; message: string } {
  console.log("Checking cooldown for profile:");
  console.log("Last rolled at:", profile.last_rolled_at);

  const result = {
    message: "",
    status: "success" as statusType,
  };

  if (profile.last_rolled_at) {
    const lastRolled = new Date(profile.last_rolled_at);
    const now = new Date();
    const hoursSinceLastRoll =
      (now.getTime() - lastRolled.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastRoll < COOLDOWN_HOURS) {
      const totalSecondsLeft = Math.ceil(
        (COOLDOWN_HOURS - hoursSinceLastRoll) * 3600,
      );
      const hoursLeft = Math.floor(totalSecondsLeft / 3600);
      const minutesLeft = Math.floor((totalSecondsLeft % 3600) / 60);
      const secondsLeft = totalSecondsLeft % 60;

      result.status = "cooldown";
      result.message = `You must wait ${hoursLeft
        .toString()
        .padStart(2, "0")}:${minutesLeft
        .toString()
        .padStart(2, "0")}:${secondsLeft
        .toString()
        .padStart(2, "0")} before rolling again.`;
    }
  } else {
    console.log("No last rolled timestamp found, allowing roll.");
  }

  return result;
}
