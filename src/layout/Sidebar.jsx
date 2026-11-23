import React from "react";
import { NavLink } from "react-router-dom";
import { MAIN_NAV, SECONDARY_NAV } from "./navConfig.js";
import { SidebarAccount } from "../components/UserMenu.jsx";

function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
          isActive ? "bg-paper-raised text-ink font-medium" : "text-ink-soft hover:text-ink hover:bg-paper-raised/60"
        }`
      }
    >
      <Icon size={17} aria-hidden="true" />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-line px-3 py-6 gap-6 sticky top-0 h-screen">
      <div className="px-3 flex items-center gap-3">
        <img src="/favicon.svg" alt="" width="36" height="36" className="rounded-lg shrink-0" />
        <div>
          <div className="font-display font-semibold text-lg leading-tight">Copiloto</div>
          <div className="font-display font-semibold text-lg leading-tight text-teal">Financiero</div>
        </div>
      </div>
      <nav aria-label="Navegación principal" className="flex flex-col gap-1">
        {MAIN_NAV.map((item) => (
          <Item key={item.to} {...item} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-line">
        {SECONDARY_NAV.map((item) => (
          <Item key={item.to} {...item} />
        ))}
        <SidebarAccount />
      </div>
    </aside>
  );
}
