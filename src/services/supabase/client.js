import { createClient } from "@supabase/supabase-js";
import { safeReturnPath } from "../../auth/authState.js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export { safeReturnPath };

// El retorno de OAuth debe llegar al MISMO origen donde empezó el login: el
// "code verifier" de PKCE vive en el localStorage de ese origen. Si se inicia en
// 127.0.0.1 o en la IP de red y se vuelve a localhost, el canje falla en silencio.
// VITE_APP_URL queda solo como respaldo fuera del navegador.
export function oauthRedirectUrl(returnTo = "/") {
  const configuredBase = import.meta.env.VITE_APP_URL?.replace(/\/$/, "");
  const base = typeof window !== "undefined" ? window.location.origin : configuredBase;
  return `${base}/auth/callback?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
