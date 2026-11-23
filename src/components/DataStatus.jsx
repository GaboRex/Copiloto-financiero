import React from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { useFinanceMeta } from "../context/FinanceContext.jsx";

export function DataStatus() {
  const { status, message, clearMessage } = useFinanceMeta();
  if (status === "idle") return null;
  const labels = { loading: "Cargando información…", saving: "Guardando…", saved: "Guardado", error: message || "No pudimos completar la operación.", session_expired: "Tu sesión venció. Vuelve a iniciar sesión." };
  const isProblem = status === "error" || status === "session_expired";
  const Icon = isProblem ? AlertCircle : status === "saved" ? Check : Loader2;
  // En móvil va sobre la barra inferior (no tapa el encabezado); en escritorio, arriba a la derecha.
  return <div role={isProblem ? "alert" : "status"} className={`fixed z-50 left-4 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:left-auto md:bottom-auto md:top-4 md:right-4 md:max-w-sm flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-card animate-fade-in-up ${isProblem ? "border-brick/40 bg-[#F7E9E4] text-brick" : "border-line bg-paper-raised text-ink"}`}>
    <Icon size={16} aria-hidden="true" className={`shrink-0 ${status === "saving" || status === "loading" ? "animate-spin" : ""} ${status === "saved" ? "text-teal" : ""}`} />
    <span className="flex-1">{labels[status] || status}</span>
    {message ? <button aria-label="Cerrar mensaje" className="h-8 w-8 -mr-2 grid place-items-center rounded hover:bg-paper" onClick={clearMessage}>×</button> : null}
  </div>;
}
