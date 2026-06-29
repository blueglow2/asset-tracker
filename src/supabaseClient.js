import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ygaxwzzfyuehcsrmexeb.supabase.co";
const SUPABASE_KEY = "sb_publishable_iYqSX4aHTpq4Zc9I5jKBGg_gAo0Mxh4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
