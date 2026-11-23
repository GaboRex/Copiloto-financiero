import React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/primitives.jsx";
import { OnboardingProgress } from "./OnboardingProgress.jsx";

export function OnboardingComplete({ onBack, onFinish }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in-up">
      <OnboardingProgress current={2} />
      <div className="w-full max-w-md bg-paper border border-line rounded-xl shadow-card p-7 sm:p-9">
        <div className="relative w-16 h-16 mx-auto grid place-items-center">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-teal/20 animate-ping [animation-iteration-count:2]" />
          <span className="relative w-16 h-16 rounded-full bg-teal text-paper grid place-items-center animate-check-in">
            <CheckCircle2 size={30} aria-hidden="true" />
          </span>
        </div>
        <h1 className="font-display text-3xl font-semibold mt-5">¡Todo listo!</h1>
        <p className="text-ink-soft text-sm mt-3">
          Ya tienes las bases para comenzar. A medida que registres más información, tu Copiloto podrá ayudarte con
          recomendaciones cada vez más útiles.
        </p>
        <div className="flex items-center justify-between gap-3 mt-7">
          <Button variant="secondary" onClick={onBack}>Atrás</Button>
          <Button onClick={onFinish}>Comenzar</Button>
        </div>
      </div>
    </div>
  );
}

