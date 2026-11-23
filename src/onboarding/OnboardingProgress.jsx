import React from "react";
import { Check } from "lucide-react";

const STEPS = ["Perfil", "Cuentas", "Listo"];

// Indicador de progreso común a todo el onboarding.
export function OnboardingProgress({ current }) {
  return <nav aria-label="Progreso de la configuración" className="w-full max-w-sm mx-auto mb-8">
    <ol className="flex items-center">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return <li key={label} className="flex items-center flex-1 last:flex-none" aria-current={active ? "step" : undefined}>
          <div className="flex flex-col items-center gap-1.5">
            <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold transition-colors duration-300 ${done ? "bg-teal text-paper" : active ? "bg-paper border-2 border-teal text-teal" : "bg-paper-raised text-ink-soft"}`}>
              {done ? <Check size={15} aria-hidden="true" className="animate-check-in" /> : index + 1}
            </span>
            <span className={`text-xs ${active ? "text-ink font-medium" : "text-ink-soft"}`}>
              {label}
              <span className="sr-only">{done ? " (completado)" : active ? " (paso actual)" : ""}</span>
            </span>
          </div>
          {index < STEPS.length - 1 ? (
            <span aria-hidden="true" className="relative mx-2 mb-5 h-0.5 flex-1 rounded-full bg-paper-raised overflow-hidden">
              <span className={`absolute inset-y-0 left-0 bg-teal transition-[width] duration-500 ease-out ${done ? "w-full" : "w-0"}`} />
            </span>
          ) : null}
        </li>;
      })}
    </ol>
  </nav>;
}
