import React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { WalletCards } from "lucide-react";
import { GuestBanner, UserMenu } from "../components/UserMenu.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { BottomNav } from "./BottomNav.jsx";

const headerLink = ({ isActive }) =>
  `h-10 w-10 grid place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${isActive ? "text-teal bg-paper-raised" : "text-ink-soft hover:text-ink"}`;

export function AppShell() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between pl-4 pr-2 py-1.5 border-b border-line bg-paper/95 backdrop-blur pt-[max(0.375rem,env(safe-area-inset-top))]">
          <div className="font-display font-semibold">Copiloto Financiero</div>
          {/* Cuentas y la cuenta del usuario (Configuración, Cerrar sesión) no caben en la barra inferior. */}
          <nav aria-label="Accesos secundarios" className="flex items-center gap-1">
            <NavLink to="/cuentas" className={headerLink} aria-label="Cuentas"><WalletCards size={20} aria-hidden="true" /></NavLink>
            <UserMenu />
          </nav>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8 max-w-5xl w-full mx-auto">
          <GuestBanner />
          {/* La clave por ruta reinicia la animación de entrada en cada cambio de página. */}
          <div key={location.pathname} className="animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
