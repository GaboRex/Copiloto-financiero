import React from "react";

// Esqueleto con la forma de Inicio: reduce la espera percibida y evita saltos
// de diseño cuando llegan los datos.
export function LoadingScreen() {
  return <main className="min-h-screen bg-paper" aria-busy="true">
    <p role="status" className="sr-only">Cargando tu información…</p>
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line">
      <div className="skeleton h-5 w-40" />
      <div className="skeleton h-8 w-8 rounded-full" />
    </div>
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-10 flex flex-col gap-5" aria-hidden="true">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-48 w-full rounded-xl" />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="skeleton h-16" />
        <div className="skeleton h-16" />
      </div>
      <div className="skeleton h-40 w-full" />
    </div>
  </main>;
}
