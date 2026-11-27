import React, { useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { Button, IconButton, Modal } from "../ui/primitives.jsx";
import { useDismissed, useInstallPrompt } from "../../pwa/pwa.js";

// Instalar: en Android/PC abre el aviso nativo; en iPhone muestra la guía de Safari.
export function useInstallApp() {
  const install = useInstallPrompt();
  const [guideOpen, setGuideOpen] = useState(false);
  async function start() {
    if (install.nativePrompt) return install.promptInstall();
    if (install.ios) setGuideOpen(true);
    return "guide";
  }
  const guide = <IOSInstallGuide open={guideOpen} onClose={() => setGuideOpen(false)} />;
  return { ...install, start, guide };
}

function IOSInstallGuide({ open, onClose }) {
  const steps = [
    { icon: Share, text: <>En <strong>Safari</strong>, toca el botón <strong>Compartir</strong> (el cuadrado con una flecha hacia arriba).</> },
    { icon: PlusSquare, text: <>Desliza y elige <strong>Agregar a pantalla de inicio</strong>.</> },
    { icon: Download, text: <>Toca <strong>Agregar</strong>. El robot aparecerá entre tus apps.</> },
  ];
  return <Modal open={open} onClose={onClose} title="Instalar en iPhone">
    <ol className="flex flex-col gap-4">
      {steps.map(({ icon: Icon, text }, index) => <li key={index} className="flex gap-3 items-start">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal/10 text-teal"><Icon size={18} aria-hidden="true" /></span>
        <p className="text-sm pt-1.5"><span className="sr-only">Paso {index + 1}: </span>{text}</p>
      </li>)}
    </ol>
    <p className="mt-4 text-xs text-ink-soft">Si usas Chrome u otro navegador en iPhone, abre este enlace en Safari para poder instalarla.</p>
    <Button className="mt-5 w-full" onClick={onClose}>Entendido</Button>
  </Modal>;
}

// Tarjeta en Inicio. Se puede descartar; la opción sigue en Configuración.
export function InstallAppCard() {
  const install = useInstallApp();
  const { isDismissed, dismiss } = useDismissed();
  if (!install.canInstall || isDismissed("install-card")) return install.guide;
  return <div className="relative flex items-center gap-3 rounded-lg border border-teal/25 bg-teal/5 p-4 animate-fade-in-up">
    <img src="/favicon.svg" alt="" width="44" height="44" className="rounded-xl shadow-card shrink-0" />
    <div className="flex-1 min-w-0 pr-6">
      <p className="font-medium text-sm">Instala Copiloto en tu {install.ios ? "iPhone" : "dispositivo"}</p>
      <p className="text-xs text-ink-soft mt-0.5">Ábrelo desde tu pantalla de inicio, como cualquier app.</p>
      <Button size="sm" className="mt-2.5" onClick={install.start}><Download size={15} aria-hidden="true" />Instalar app</Button>
    </div>
    <IconButton label="Ocultar sugerencia de instalación" className="absolute right-1.5 top-1.5" onClick={() => dismiss("install-card")}><X size={16} aria-hidden="true" /></IconButton>
    {install.guide}
  </div>;
}
