import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Globe, Linkedin } from "lucide-react";

// Créditos y contacto de quienes desarrollan la app.
export const CREDITS = [
  { name: "Gabriel Solutions", detail: "Portafolio", href: "https://portafolio-web-gn.vercel.app", icon: Globe },
  { name: "Nicolás Fuentes Rodríguez", detail: "LinkedIn", href: "https://www.linkedin.com/in/nicol%C3%A1s-fuentes-rodr%C3%ADguez-b80b47285/", icon: Linkedin },
];

const linkBase = "group inline-flex items-center gap-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal";

// variant "full": pie de la app (con logo y año). "compact": una línea para el login.
export function SiteFooter({ variant = "full", className = "" }) {
  const year = new Date().getFullYear();

  if (variant === "compact") {
    return <footer className={`text-xs text-ink-soft ${className}`}>
      <p className="flex flex-wrap items-center justify-center lg:justify-start gap-x-1 gap-y-1">
        <span>Desarrollado por</span>
        {CREDITS.map((credit, index) => <React.Fragment key={credit.href}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          <a href={credit.href} target="_blank" rel="noopener noreferrer" className={`${linkBase} font-medium text-ink hover:text-teal underline-offset-2 hover:underline`}>
            {credit.name}<span className="sr-only"> ({credit.detail}, se abre en otra pestaña)</span>
          </a>
        </React.Fragment>)}
      </p>
      <p className="mt-1.5 text-center lg:text-left"><Link to="/privacidad" className="underline underline-offset-2 hover:text-ink">Política de privacidad</Link></p>
    </footer>;
  }

  return <footer className={`mt-12 border-t border-line pt-6 pb-2 ${className}`}>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" width="28" height="28" className="rounded-md" />
        <div>
          <p className="font-display font-semibold text-sm leading-tight">Copiloto Financiero</p>
          <p className="text-xs text-ink-soft">© {year} · Hecho en Bolivia · <Link to="/privacidad" className="underline underline-offset-2 hover:text-ink">Privacidad</Link></p>
        </div>
      </div>
      <div>
        <p className="text-xs text-ink-soft mb-2">Desarrollado por</p>
        <ul className="flex flex-wrap gap-2">
          {CREDITS.map(({ name, detail, href, icon: Icon }) => <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer" className={`${linkBase} border border-line bg-paper pl-2.5 pr-3 min-h-[36px] text-sm text-ink hover:border-teal/40 hover:bg-teal/5`}>
              <Icon size={15} aria-hidden="true" className="text-teal" />
              <span>{name}</span>
              <span className="text-xs text-ink-soft">· {detail}</span>
              <ArrowUpRight size={13} aria-hidden="true" className="text-ink-soft transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </li>)}
        </ul>
      </div>
    </div>
  </footer>;
}
