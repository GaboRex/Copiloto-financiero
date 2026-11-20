import React from "react";
import { NavLink } from "react-router-dom";
import { MAIN_NAV } from "./navConfig.js";

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="md:hidden fixed bottom-0 inset-x-0 bg-paper/95 backdrop-blur border-t border-line flex z-40 pb-[env(safe-area-inset-bottom)]"
    >
      {MAIN_NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-1 min-w-0 min-h-[56px] flex-col items-center justify-center gap-1 px-0.5 text-[0.7rem] leading-none focus-visible:outline-none focus-visible:bg-paper-raised ${isActive ? "text-teal font-medium" : "text-ink-soft"}`
          }
        >
          {({ isActive }) => (
            <>
              {/* Indicador superior: el estado activo no depende solo del color. */}
              <span aria-hidden="true" className={`absolute top-0 h-0.5 w-8 rounded-full ${isActive ? "bg-teal" : "bg-transparent"}`} />
              <Icon size={20} aria-hidden="true" strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="truncate w-full text-center">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
