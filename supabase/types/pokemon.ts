export interface PokemonSprites {
  front_default?: string | null;
  front_shiny?: string | null;
  official_artwork_shiny: string | null;
  official_artwork_default: string | null;
}

export interface Pokemon {
  id: number;
  handle: string;
  pokedex_id: number;
  form_id: number;
  name: string;
  form_name: string | null;
  sprites: any;
  height: number | null;
  weight: number | null;
  capture_rate: number | null;
  gender_rate: number | null;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  flavor_text: string | null;
}

export interface CooldownStatus {
  canRoll: boolean;
  message: string | null;
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

type UserPokemonRow = Database["public"]["Tables"]["user_pokemon"]["Row"];
type UserPokemonWithDetails = Pick<UserPokemonRow, "id" | "shiny"> & {
  pokemon: Pokemon | null;
};
