import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Compass, HardDrive, Loader2, Lock, MonitorSmartphone, ShieldCheck, TrendingUp } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { safeReturnPath } from "../auth/authState.js";

const BENEFITS = [
  { icon: ShieldCheck, title: "Tus datos son solo tuyos", text: "Cada cuenta está aislada; nadie más puede ver tu información." },
  { icon: MonitorSmartphone, title: "En todos tus dispositivos", text: "Empieza en el celular y continúa en la computadora." },
  { icon: TrendingUp, title: "Decisiones con cifras reales", text: "Saldos, proyecciones y respuestas calculadas con tus movimientos." },
];

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}

export default function Login() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
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

  return <main className="min-h-screen bg-paper lg:grid lg:grid-cols-[1.05fr_1fr]">
    {/* Panel de marca: arriba en móvil, a la izquierda en escritorio. */}
    <section className="relative overflow-hidden bg-teal text-paper px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-10 lg:p-14 lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-paper/10 lg:h-[28rem] lg:w-[28rem]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full border border-paper/10 lg:h-64 lg:w-64" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-[-6rem] h-64 w-64 rounded-full bg-paper/[0.04] hidden lg:block" />

      <div className="relative flex items-center gap-3">
        <span className="h-10 w-10 rounded-full bg-paper/10 border border-paper/20 grid place-items-center"><Compass size={20} aria-hidden="true" /></span>
        <span className="font-display text-lg font-semibold leading-tight">Copiloto<br className="hidden lg:block" /> Financiero</span>
      </div>

      <div className="relative mt-8 lg:mt-0 max-w-lg">
        <h1 className="font-display text-3xl lg:text-5xl font-semibold leading-[1.15]">Tu dinero, con claridad.</h1>
        <p className="mt-3 lg:mt-4 text-paper/85 lg:text-lg">Organiza tus cuentas, entiende en qué se va tu dinero y decide con números, no con corazonadas.</p>
        <ul className="mt-8 hidden lg:flex flex-col gap-5">
          {BENEFITS.map(({ icon: Icon, title, text }) => <li key={title} className="flex gap-4">
            <span className="h-10 w-10 rounded-lg bg-paper/10 grid place-items-center shrink-0"><Icon size={19} aria-hidden="true" /></span>
            <span><span className="block font-medium">{title}</span><span className="block text-sm text-paper/80 mt-0.5">{text}</span></span>
          </li>)}
        </ul>
      </div>

      <p className="relative hidden lg:block text-sm text-paper/70">Hecho para ayudarte a gastar con tranquilidad.</p>
    </section>

    {/* Formulario de acceso */}
    <section className="relative -mt-5 lg:mt-0 rounded-t-3xl lg:rounded-none bg-paper px-6 pt-8 pb-10 lg:p-14 flex flex-col lg:justify-center">
      <div className="w-full max-w-sm mx-auto">
        <h2 className="font-display text-2xl lg:text-3xl font-semibold">Inicia sesión</h2>
        <p className="mt-2 text-ink-soft">Entra con tu cuenta de Google. Si es tu primera vez, crearemos tu espacio automáticamente.</p>

        {auth.error ? <div role="alert" className="mt-5 rounded-lg border border-brick/30 bg-brick/10 p-3 text-sm text-brick">{auth.error}</div> : null}
        {!auth.configured ? <div role="status" className="mt-5 rounded-lg border border-ochre/40 bg-ochre/10 p-3 text-sm text-[#6E4B17]">La conexión segura todavía no está configurada. Revisa la sección «Crear el proyecto de Supabase» del README.</div> : null}

        <button type="button" onClick={start} disabled={!auth.configured || working} aria-busy={working}
          className="mt-7 w-full min-h-[52px] inline-flex items-center justify-center gap-3 rounded-lg border border-line-strong bg-white px-5 text-[0.95rem] font-medium text-ink shadow-sm transition hover:bg-[#FBFAF6] hover:shadow-card active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          {working ? <Loader2 size={20} className="animate-spin text-ink-soft" aria-hidden="true" /> : <GoogleMark />}
          {working ? "Abriendo Google…" : "Continuar con Google"}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-ink-soft" aria-hidden="true"><span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" /></div>

        <button type="button" onClick={startAsGuest}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg border border-line px-5 text-[0.95rem] font-medium text-ink transition hover:bg-paper-raised active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          Probar como invitado
        </button>
        <p className="mt-2 flex items-start justify-center gap-1.5 text-center text-xs text-ink-soft"><HardDrive size={13} className="mt-0.5 shrink-0" aria-hidden="true" />Sin cuenta: tus datos quedan solo en este navegador. Puedes pasarlos a tu cuenta cuando quieras.</p>

        {/* Beneficios en móvil (en escritorio están en el panel de marca). */}
        <ul className="mt-8 flex flex-col gap-4 lg:hidden">
          {BENEFITS.map(({ icon: Icon, title, text }) => <li key={title} className="flex gap-3">
            <span className="h-9 w-9 rounded-lg bg-teal/10 text-teal grid place-items-center shrink-0"><Icon size={17} aria-hidden="true" /></span>
            <span><span className="block text-sm font-medium">{title}</span><span className="block text-sm text-ink-soft">{text}</span></span>
          </li>)}
        </ul>

        <p className="mt-8 flex gap-2 text-xs text-ink-soft leading-relaxed">
          <Lock size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>Al continuar, tus datos financieros se guardan asociados a tu cuenta. Nunca pedimos acceso a tu banco ni tus contraseñas.</span>
        </p>
      </div>
    </section>
  </main>;
}
