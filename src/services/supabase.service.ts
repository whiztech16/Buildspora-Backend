import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export function getSupabaseAdmin() {
  return supabaseAdmin;
}

export async function verifySupabaseToken(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}