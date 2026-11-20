import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Settings, WalletCards } from "lucide-react";
import { Sidebar } from "./Sidebar.jsx";
import { BottomNav } from "./BottomNav.jsx";

const headerLink = ({ isActive }) =>
  `h-10 w-10 grid place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${isActive ? "text-teal bg-paper-raised" : "text-ink-soft hover:text-ink"}`;

export function AppShell() {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between pl-4 pr-2 py-1.5 border-b border-line bg-paper/95 backdrop-blur pt-[max(0.375rem,env(safe-area-inset-top))]">
          <div className="font-display font-semibold">Copiloto Financiero</div>
          {/* Cuentas y Configuración no caben en la barra inferior: quedan aquí, a un toque. */}
          <nav aria-label="Accesos secundarios" className="flex">
            <NavLink to="/cuentas" className={headerLink} aria-label="Cuentas"><WalletCards size={20} aria-hidden="true" /></NavLink>
            <NavLink to="/configuracion" className={headerLink} aria-label="Configuración"><Settings size={20} aria-hidden="true" /></NavLink>
          </nav>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
