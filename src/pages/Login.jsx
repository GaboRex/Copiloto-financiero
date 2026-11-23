import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { safeReturnPath } from "../auth/authState.js";
import { CopilotBot } from "../components/brand/CopilotBot.jsx";
import { SiteFooter } from "../components/SiteFooter.jsx";

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}

// Lo que "dice" el robot según lo que hace el usuario (texto corto, decorativo).
const BUBBLES = {
  idle: "¡Hola! Soy tu copiloto",
  google: "¡Vamos allá!",
  guest: "Pruébame sin cuenta",
  working: "Conectando…",
};

function Coin({ className = "", delay = "0s", size = 22 }) {
  return <span aria-hidden="true" className={`bot-coin absolute grid place-items-center rounded-full bg-[#E9B65C] shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${className}`} style={{ width: size, height: size, animationDelay: delay }}>
    <span className="rounded-full border-2 border-[#C1892E]/60" style={{ width: size * 0.62, height: size * 0.62 }} />
  </span>;
}

function BotScene({ intent }) {
  const mood = intent === "working" ? "thinking" : intent === "idle" ? "idle" : "happy";
  return <div className="relative mx-auto h-60 w-60 sm:h-72 sm:w-72 lg:h-[22rem] lg:w-[22rem] animate-pop-in">
    {/* Órbitas que giran lentamente alrededor del disco */}
    <div aria-hidden="true" className="bot-orbit absolute -inset-5 rounded-full border border-dashed border-teal/25">
      <span className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rounded-full bg-teal/70" />
    </div>
    <div aria-hidden="true" className="bot-orbit-reverse absolute -inset-11 rounded-full border border-teal/10">
      <span className="absolute -bottom-1 left-[22%] h-2 w-2 rounded-full bg-ochre" />
    </div>
    {/* Disco del robot */}
    <div className="absolute inset-0 rounded-full bg-teal shadow-[0_18px_40px_-12px_rgba(31,92,86,0.55)] overflow-hidden">
      <div aria-hidden="true" className="absolute inset-x-0 -top-1/3 h-2/3 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute inset-0 grid place-items-center pt-3">
        <CopilotBot mood={mood} size={150} className="w-[62%] h-auto" />
      </div>
    </div>
    <Coin className="-left-2 top-10" delay="0s" />
    <Coin className="-right-1 bottom-14" delay="1.1s" size={18} />
    <Coin className="left-8 -bottom-3" delay="2s" size={14} />
    {/* Globo de diálogo, centrado sobre el disco para no salirse en pantallas angostas.
        El contenedor posiciona; el hijo anima (así la animación no pisa el translate). */}
    <div aria-hidden="true" className="absolute -top-14 left-1/2 -translate-x-1/2 z-10">
      <div key={intent} className="bot-bubble relative whitespace-nowrap rounded-2xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-card">
        {BUBBLES[intent]}
        <span className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-white" />
      </div>
    </div>
  </div>;
}

export default function Login() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [hovered, setHovered] = useState("idle");
  if (auth.user || auth.guest) return <Navigate to={safeReturnPath(location.state?.returnTo)} replace />;

  async function start() {
    setWorking(true);
    const result = await auth.signInWithGoogle(location.state?.returnTo || "/");
    // Si todo va bien el navegador ya está yendo a Google; solo reactivamos el botón ante un error.
    if (result?.error) setWorking(false);
  }

  function startAsGuest() {
    auth.continueAsGuest();
    navigate(safeReturnPath(location.state?.returnTo), { replace: true });
  }

  const intent = working ? "working" : hovered;
  const react = (value) => ({ onPointerEnter: () => setHovered(value), onPointerLeave: () => setHovered("idle"), onFocus: () => setHovered(value), onBlur: () => setHovered("idle") });

  return <main className="relative min-h-[100dvh] overflow-hidden bg-paper flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-20 px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
    {/* Fondo: halos suaves de marca */}
    <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal/10 blur-3xl lg:left-1/3" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-ochre/10 blur-3xl" />

    <section className="relative flex-1 lg:flex-none grid place-items-center pt-14 pb-6">
      <BotScene intent={intent} />
    </section>

    <section className="relative w-full max-w-sm mx-auto lg:mx-0 stagger">
      <h1 className="font-display text-3xl lg:text-4xl font-semibold text-center lg:text-left">Copiloto Financiero</h1>
      <p className="mt-2 text-ink-soft text-center lg:text-left">Tu dinero, con claridad.</p>

      {auth.error ? <div role="alert" className="mt-5 rounded-lg border border-brick/30 bg-brick/10 p-3 text-sm text-brick">{auth.error}</div> : null}
      {!auth.configured ? <div role="status" className="mt-5 rounded-lg border border-ochre/40 bg-ochre/10 p-3 text-sm text-[#6E4B17]">El inicio de sesión aún no está configurado. Puedes entrar como invitado.</div> : null}

      <div className="mt-8 flex flex-col gap-3">
        <button type="button" onClick={start} disabled={!auth.configured || working} aria-busy={working} {...react("google")}
          className="w-full min-h-[54px] inline-flex items-center justify-center gap-3 rounded-2xl bg-white border border-line px-5 text-[0.95rem] font-medium text-ink shadow-[0_1px_2px_rgba(34,48,44,0.08),0_6px_16px_-6px_rgba(34,48,44,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-card active:translate-y-0 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          {working ? <Loader2 size={20} className="animate-spin text-ink-soft" aria-hidden="true" /> : <GoogleMark />}
          {working ? "Abriendo Google…" : "Continuar con Google"}
        </button>

        <button type="button" onClick={startAsGuest} {...react("guest")}
          className="w-full min-h-[54px] flex flex-col items-center justify-center rounded-2xl px-5 py-2 text-ink transition duration-200 hover:bg-paper-raised active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          <span className="text-[0.95rem] font-medium">Probar como invitado</span>
          <span className="text-xs text-ink-soft">Tus datos quedan en este dispositivo</span>
        </button>
      </div>

      <p className="mt-8 flex items-center justify-center lg:justify-start gap-1.5 text-xs text-ink-soft">
        <Lock size={13} aria-hidden="true" />Nunca pedimos acceso a tu banco.
      </p>
      <SiteFooter variant="compact" className="mt-3" />
    </section>
  </main>;
}
