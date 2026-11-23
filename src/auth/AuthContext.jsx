import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { oauthRedirectUrl, safeReturnPath, supabase, supabaseConfigured } from "../services/supabase/client.js";
import { clearGuestFlag, readGuestFlag, writeGuestFlag } from "./guestMode.js";
import { clearImportedLocalData } from "../services/import/localMigration.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Modo invitado: sin cuenta, los datos viven solo en el localStorage de este navegador.
  const [guest, setGuest] = useState(readGuestFlag);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError("No pudimos recuperar tu sesión. Intenta iniciar sesión otra vez.");
      setSession(data?.session || null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION") setError("");
      if (event === "SIGNED_OUT") setSession(null);
      else if (nextSession) {
        setSession(nextSession);
        // Al iniciar sesión, el invitado pasa a ser usuario con cuenta. Sus datos
        // locales se ofrecerán para importar (LocalMigrationPrompt).
        clearGuestFlag();
        setGuest(false);
      }
      setLoading(false);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const signInWithGoogle = useCallback(async (returnTo = "/") => {
    setError("");
    if (!supabase) {
      setError("Falta configurar la conexión segura antes de iniciar sesión.");
      return { error: new Error("Supabase no configurado") };
    }
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthRedirectUrl(safeReturnPath(returnTo)), skipBrowserRedirect: false },
    });
    if (result.error) setError("Google canceló el acceso o no pudimos iniciarlo. Puedes volver a intentarlo.");
    return result;
  }, []);

  const signOut = useCallback(async () => {
    setError("");
    let result = { error: null };
    if (supabase) {
      // "global" revoca la sesión en el servidor, pero si esa petición falla
      // supabase-js conserva la sesión en el navegador y el siguiente refresco
      // del token la "revive". En ese caso cerramos al menos este dispositivo.
      result = await supabase.auth.signOut({ scope: "global" }).catch((thrown) => ({ error: thrown }));
      if (result.error) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
    setSession(null);
    return result;
  }, []);

  const continueAsGuest = useCallback(() => {
    writeGuestFlag();
    setGuest(true);
  }, []);

  // Salir del modo invitado; con clearData se borran los datos de este navegador.
  const exitGuest = useCallback(({ clearData = false } = {}) => {
    if (clearData) clearImportedLocalData();
    clearGuestFlag();
    setGuest(false);
  }, []);

  const user = session?.user || null;
  const value = useMemo(() => ({
    session, user, loading, error, configured: supabaseConfigured,
    guest: guest && !user,
    signInWithGoogle, signOut, continueAsGuest, exitGuest,
    clearError: () => setError(""),
  }), [session, user, loading, error, guest, signInWithGoogle, signOut, continueAsGuest, exitGuest]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}

