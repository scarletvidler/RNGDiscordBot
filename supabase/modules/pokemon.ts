import { getSupabaseAdmin } from "../client.ts";
import type { Database } from "../types.ts";
import {
  CooldownStatus,
  Pokemon,
  RolledPokemon,
  SpriteContainer,
  UserPokemon,
} from "../types/pokemon.ts";

export interface Profile {
  id: string;
  last_rolled_at: string | null;
}

const COOLDOWN_HOURS = 4;
const SHINY_CHANCE = 0.01;

const cooldownStatus = (lastRolledAt: ["last_rolled_at"]) => {
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
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { data: null, error: "Supabase client not initialized" };
  }

  const { canRoll, message } = cooldownStatus(profile.last_rolled_at);

  if (!canRoll) {
    return { data: canRoll, error: message };
  }

  let dynamicQuery = supabase
    .from("pokemon_profiles")
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
      .from("pokemon_profiles")
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
      ownedPokemon?.map(
        (pokemon: Pick<UserPokemonRow, "pokemon_id">) => pokemon.pokemon_id,
      ) ?? [];

    const query = supabase.from("pokemon").select("*").throwOnError();

    const { data: available } = await (ownedPokemonIds.length > 0
      ? query.not("id", "in", `(${ownedPokemonIds.join(",")})`)
      : query);

    console.log("fetched from:", available?.[0]);
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
        ...randomPokemon,
        sprite: spriteUrl,
        isShiny,
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
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { data: null, error: "Supabase client not initialized" };
  }

  const { data, error } = await supabase
    .from("user_pokemon")
    .select("id, shiny, pokemon(*)")
    .eq("profile_id", profile.id);

  if (error) return { data: null, error };
  if (!data) return { data: [], error: null };

  const formattedData = (data as UserPokemonWithDetails[]).map((user) => {
    const spriteUrl = getPokemonSprite(user.pokemon, user.shiny);

    return {
      id: user.id,
      isShiny: user.shiny,
      sprite: spriteUrl,
      pokemon: user.pokemon,
    };
  });

  return { data: formattedData as unknown as UserPokemon[], error: null };
};

// logic to keep rolling/being able to roll the shiny version of what you have - sort of inherently done maybe?
// roster
// differentiate and show both or one (most likely shiny) on the roster - ehh
// roll chances stacking up to 24h and you get one every 6h or something like that so you can wake up and roll 4
