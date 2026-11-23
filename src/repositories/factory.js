import { supabase } from "../services/supabase/client.js";
import { assertFinanceRepository } from "./contracts.js";
import { createLocalFinanceRepository } from "./localFinanceRepository.js";
import { createSupabaseFinanceRepository } from "./supabaseFinanceRepository.js";

// Con cuenta: Supabase. Invitado (o VITE_DATA_MODE=local): localStorage.
export function createFinanceRepository(user, { guest = false } = {}) {
  const explicitLocal = import.meta.env.VITE_DATA_MODE === "local";
  if (explicitLocal || (guest && !user?.id)) return assertFinanceRepository(createLocalFinanceRepository());
  if (!supabase || !user?.id) return null;
  return assertFinanceRepository(createSupabaseFinanceRepository(supabase, user.id));
}

