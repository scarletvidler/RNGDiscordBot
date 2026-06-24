import { supabase } from "./client.ts";

export interface Profile {
  id: string;
  last_rolled_at: string | null;
}

export interface CooldownStatus {
  canRoll: boolean;
  message: string | null;
}

export interface PokemonSprites {
  front_default?: string | null;
  front_shiny?: string | null;
  official_artwork_shiny: string | null;
  official_artwork_default: string | null;
}

export interface Pokemon {
  id: number;
  name: string;
  pokedex_id: number;
  sprites: any;
  capture_rate: number | null;
  height: number | null;
  weight: number | null;
  flavor_text: string | null;
  has_gender_differences: boolean;
  legendary: boolean;
  mythical: boolean;
}

export interface SpriteContainer {
  sprites?: any;
}

export interface RolledPokemon extends Omit<Pokemon, "sprites"> {
  sprite: string | null | undefined;
  isShiny: boolean;
}

export interface UserPokemon {
  id: string;
  isShiny: boolean;
  sprite: string | null | undefined;
  pokemon: Pokemon | null;
}

const COOLDOWN_HOURS = 0.01;
const SHINY_CHANCE = 0.01;

const cooldownStatus = (lastRolledAt: Profile["last_rolled_at"]) => {
  const status: CooldownStatus = {
    canRoll: false,
    message: null,
  };

  if (!lastRolledAt) {
    status.canRoll = true;
    return status;
  }

  const lastRolled = new Date(lastRolledAt);
  const now = new Date();
  const hoursSinceLastRoll =
    (now.getTime() - lastRolled.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastRoll >= COOLDOWN_HOURS) {
    status.canRoll = true;
    return status;
  }

  const totalSecondsLeft = Math.ceil(
    (COOLDOWN_HOURS - hoursSinceLastRoll) * 3600,
  );
  const hoursLeft = Math.floor(totalSecondsLeft / 3600);
  const minutesLeft = Math.floor((totalSecondsLeft % 3600) / 60);
  const secondsLeft = totalSecondsLeft % 60;

  status.message = `You must wait ${hoursLeft
    .toString()
    .padStart(2, "0")}:${minutesLeft.toString().padStart(2, "0")}:${secondsLeft
    .toString()
    .padStart(2, "0")} before rolling again.`;

  return status;
};

const pickRandomPokemon = (pokemonList: Pokemon[]): Pokemon => {
  const totalWeight = pokemonList.reduce(
    (sum, pokemon) => sum + (pokemon.capture_rate ?? 45),
    0,
  );
  let randomValue = Math.random() * totalWeight;

  for (const pokemon of pokemonList) {
    const weight = pokemon.capture_rate ?? 45;
    randomValue -= weight;
    if (randomValue <= 0) return pokemon;
  }
  return pokemonList[pokemonList.length - 1];
};

const getPokemonSprite = (
  pokemon: SpriteContainer | null | undefined,
  isShiny: boolean,
): string | null | undefined => {
  return isShiny
    ? pokemon?.sprites?.official_artwork_shiny
    : pokemon?.sprites?.official_artwork_default;
};

export const rollPokemon = async (
  profile: Profile,
): Promise<{ data: RolledPokemon | boolean | null; error: any }> => {
  const { canRoll, message } = cooldownStatus(profile.last_rolled_at);

  if (!canRoll) {
    return { data: canRoll, error: message };
  }

  let dynamicQuery = supabase
    .from("profiles")
    .update({ last_rolled_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (profile.last_rolled_at === null) {
    dynamicQuery = dynamicQuery.is("last_rolled_at", null);
  } else {
    dynamicQuery = dynamicQuery.eq("last_rolled_at", profile.last_rolled_at);
  }

  const { data: updatedProfile, error: updateError } =
    await dynamicQuery.select();

  if (updateError) return { data: null, error: updateError };

  if (!updatedProfile || updatedProfile.length === 0) {
    return {
      data: null,
      error: "Roll already in progress or cooldown updated",
    };
  }

  const revertCooldown = async () => {
    await supabase
      .from("profiles")
      .update({ last_rolled_at: profile.last_rolled_at })
      .eq("id", profile.id);
  };

  try {
    const isShiny = Math.random() < SHINY_CHANCE;

    const { data: ownedPokemon } = await supabase
      .from("user_pokemon")
      .select("pokemon_id")
      .eq("profile_id", profile.id)
      .eq("shiny", isShiny)
      .throwOnError();

    const ownedPokemonIds =
      ownedPokemon?.map((pokemon) => pokemon.pokemon_id) ?? [];

    const query = supabase
      .from("pokemon")
      .select(
        "id,name,sprites,pokedex_id,height,weight,flavor_text,has_gender_differences,capture_rate,legendary,mythical",
      )
      .throwOnError();

    const { data: available } = await (ownedPokemonIds.length > 0
      ? query.not("id", "in", `(${ownedPokemonIds.join(",")})`)
      : query);

    if (!available?.length) {
      throw new Error("You caught them all!");
    }

    const randomPokemon = pickRandomPokemon(available);

    await supabase
      .from("user_pokemon")
      .insert({
        profile_id: profile.id,
        pokemon_id: randomPokemon.id,
        shiny: isShiny,
      })
      .throwOnError();

    const spriteUrl = getPokemonSprite(randomPokemon, isShiny);

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
        has_gender_differences: randomPokemon.has_gender_differences,
        capture_rate: randomPokemon.capture_rate,
        legendary: randomPokemon.legendary,
        mythical: randomPokemon.mythical,
      },
      error: null,
    };
  } catch (error) {
    await revertCooldown();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { data: null, error: errorMessage };
  }
};

export const getUserPokemon = async (
  profile: Profile,
): Promise<{ data: UserPokemon[] | null; error: any }> => {
  const { data, error } = await supabase
    .from("user_pokemon")
    .select("id, shiny, pokemon(*)")
    .eq("profile_id", profile.id);

  if (error) return { data: null, error };
  if (!data) return { data: [], error: null };

  const formattedData = data.map((user) => {
    const spriteUrl = getPokemonSprite(user.pokemon, user.shiny);

    return {
      id: user.id,
      isShiny: user.shiny,
      sprite: spriteUrl,
      pokemon: user.pokemon,
    };
  });

  return { data: formattedData, error: null };
};

// logic to keep rolling/being able to roll the shiny version of what you have - sort of done maybe?
// roster - ehh
// differentiate and show both or one (most likely shiny) on the roster - ehh
