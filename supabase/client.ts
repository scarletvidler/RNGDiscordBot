import { createClient } from "@supabase/supabase-js";
import { Database } from "../database.types.ts";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
