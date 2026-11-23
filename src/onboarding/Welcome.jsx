import React from "react";
import { Clock, Compass, Lock, Sparkles } from "lucide-react";
import { Button } from "../components/ui/primitives.jsx";

const POINTS = [
  { icon: Clock, text: "Toma unos 2 minutos" },
  { icon: Lock, text: "Sin acceso a tu banco" },
  { icon: Sparkles, text: "Consejos con tus cifras" },
];

export function Welcome({ onStart }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="stagger flex flex-col items-center">
        <div className="relative grid place-items-center mb-7 h-28 w-28">
          <span aria-hidden="true" className="absolute h-28 w-28 rounded-full border border-teal/15" />
          <span aria-hidden="true" className="absolute h-20 w-20 rounded-full border border-teal/25" />
          <span className="relative w-14 h-14 rounded-full bg-teal text-paper flex items-center justify-center shadow-card">
            <Compass size={26} aria-hidden="true" />
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold max-w-md leading-tight">Bienvenido a tu Copiloto Financiero</h1>
        <p className="text-ink-soft mt-4 max-w-md">
          Organiza tus finanzas, entiende tu situación financiera y toma mejores decisiones con tu dinero.
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-ink-soft">
              <Icon size={13} aria-hidden="true" className="text-teal" />{text}
            </li>
          ))}
        </ul>
        <Button size="lg" className="mt-8 min-w-[12rem]" onClick={onStart}>
          Comenzar
        </Button>
        <p className="mt-3 text-xs text-ink-soft">Te pediremos tu nombre y dónde guardas tu dinero.</p>
      </div>
    </div>
  );
}
