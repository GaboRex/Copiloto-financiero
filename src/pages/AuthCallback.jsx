import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { safeReturnPath, supabase } from "../services/supabase/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

// Traduce los errores técnicos del canje OAuth a algo accionable.
function describeError(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  if (text.includes("verifier")) return "El acceso empezó en otra pestaña o dirección del navegador (por ejemplo 127.0.0.1 en lugar de localhost). Abre la app siempre desde la misma dirección y vuelve a intentarlo.";
  if (text.includes("flow_state") || text.includes("expired") || text.includes("invalid")) return "El enlace de acceso venció o ya se usó. Vuelve a iniciar sesión.";
  if (text.includes("access_denied")) return "Cancelaste el acceso en Google o tu cuenta no está autorizada como usuario de prueba.";
  if (text.includes("redirect")) return "La dirección de retorno no está autorizada en Supabase (Authentication > URL Configuration).";
  return "Google o Supabase no completaron el acceso.";
}

export default function AuthCallback() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [failure, setFailure] = useState(null);
  const exchangeTried = useRef(false);
  const oauthError = params.get("error_description") || params.get("error");
  const code = params.get("code");

  useEffect(() => {
    if (oauthError) { setFailure({ message: describeError(oauthError), detail: oauthError }); return; }
    if (auth.user) { navigate(safeReturnPath(params.get("returnTo")), { replace: true }); return; }
    if (auth.loading) return;
    // La librería canjea el código sola al iniciar. Si no hubo sesión, lo
    // intentamos una vez de forma explícita para conocer el motivo real.
    if (code && supabase && !exchangeTried.current) {
      exchangeTried.current = true;
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setFailure({ message: describeError(error), detail: error.message });
      });
      return;
    }
    if (!code) setFailure({ message: "No recibimos el código de acceso.", detail: "missing_code" });
  }, [auth.user, auth.loading, navigate, params, oauthError, code]);

  if (!failure) return <main className="min-h-screen grid place-items-center bg-paper"><p role="status">Completando el acceso seguro…</p></main>;
  return <main className="min-h-screen grid place-items-center bg-paper p-5"><div className="max-w-md text-center">
    <h1 className="font-display text-2xl">No pudimos completar el acceso</h1>
    <p role="alert" className="my-3 text-ink-soft">{failure.message}</p>
    {failure.detail ? <p className="mb-4 text-xs text-ink-soft/80 break-words">Detalle técnico: {failure.detail}</p> : null}
    <button className="text-ochre-ink underline underline-offset-2 min-h-[40px]" onClick={() => navigate("/login", { replace: true })}>Volver a intentarlo</button>
  </div></main>;
}
