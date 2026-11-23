import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CREDITS, SiteFooter } from "../components/SiteFooter.jsx";

// Política de privacidad pública (requisito de Google para publicar el acceso
// con Google en modo producción). Describe lo que la app hace realmente.
// Si se define un correo de contacto, se muestra como vía principal.
const CONTACT_EMAIL = "";
const LAST_UPDATED = "noviembre de 2026";

function Section({ title, children }) {
  return <section className="mt-8">
    <h2 className="font-display text-xl font-semibold">{title}</h2>
    <div className="mt-2 flex flex-col gap-3 text-[0.95rem] leading-relaxed text-ink-soft">{children}</div>
  </section>;
}

export default function Privacidad() {
  return <main className="min-h-screen bg-paper px-5 py-10 sm:py-14">
    <article className="mx-auto max-w-2xl animate-fade-in-up">
      <Link to="/login" className="inline-flex items-center gap-1.5 rounded text-sm text-ink-soft hover:text-ink min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
        <ArrowLeft size={16} aria-hidden="true" />Volver
      </Link>

      <header className="mt-4 flex items-center gap-3">
        <img src="/favicon.svg" alt="" width="44" height="44" className="rounded-xl" />
        <div>
          <p className="text-sm text-ink-soft">Copiloto Financiero</p>
          <h1 className="font-display text-3xl font-semibold leading-tight">Política de privacidad</h1>
        </div>
      </header>
      <p className="mt-3 text-sm text-ink-soft">Última actualización: {LAST_UPDATED}</p>

      <p className="mt-6 text-[0.95rem] leading-relaxed">
        Copiloto Financiero es una aplicación para organizar tus finanzas personales. Esta política explica qué datos usamos,
        para qué y cómo puedes controlarlos. En resumen: <strong>solo guardamos lo necesario para que la app funcione, nunca
        accedemos a tus cuentas bancarias y no vendemos ni compartimos tus datos con fines publicitarios.</strong>
      </p>

      <Section title="Quién es responsable">
        <p>La aplicación es desarrollada por Gabriel Solutions y Nicolás Fuentes Rodríguez. Puedes contactarnos por los medios indicados en la sección «Contacto».</p>
      </Section>

      <Section title="Qué datos usamos">
        <p><strong className="text-ink">Datos de tu cuenta de Google.</strong> Si inicias sesión con Google, recibimos tu nombre, tu correo electrónico y tu foto de perfil. Solo los usamos para identificarte, mostrar tu cuenta en la app y mantener tus datos separados de los de otras personas. No pedimos acceso a tus contactos, correos, archivos ni a ningún otro servicio de Google.</p>
        <p><strong className="text-ink">Datos que tú registras.</strong> Cuentas y saldos, ingresos y gastos, movimientos recurrentes, objetivos de ahorro, fondo de emergencia, deudas y tus preferencias (por ejemplo, la moneda). Los escribes tú: la app no se conecta a bancos y nunca te pedirá contraseñas bancarias.</p>
        <p><strong className="text-ink">Modo invitado.</strong> Si usas la app sin cuenta, tus datos se guardan únicamente en el almacenamiento de tu navegador y no se envían a nuestros servidores. Si borras los datos del sitio en tu navegador, se pierden.</p>
      </Section>

      <Section title="Para qué los usamos">
        <p>Para mostrarte tus saldos y movimientos, calcular análisis, proyecciones y recomendaciones, y permitirte usar la app desde varios dispositivos. Los cálculos y las respuestas del Copiloto se generan a partir de tus propios datos dentro de la app.</p>
        <p>No usamos tus datos para publicidad, no los vendemos y no creamos perfiles para terceros.</p>
      </Section>

      <Section title="Dónde se guardan y quién los procesa">
        <p>Con cuenta, tus datos se guardan en una base de datos de <strong className="text-ink">Supabase</strong>, protegida para que cada usuario solo pueda acceder a sus propios registros. La aplicación se publica en <strong className="text-ink">Vercel</strong> y el inicio de sesión lo gestiona <strong className="text-ink">Google</strong> a través de Supabase. Estos proveedores procesan los datos solo para prestar su servicio.</p>
        <p>En tu navegador guardamos la sesión iniciada y algunas preferencias (por ejemplo, el modo invitado). No usamos cookies de seguimiento ni herramientas de analítica publicitaria.</p>
      </Section>

      <Section title="Uso de datos de Google">
        <p>El uso que Copiloto Financiero hace de la información recibida de las APIs de Google cumple con la <a className="text-ochre-ink underline underline-offset-2" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de datos de usuario de los servicios de API de Google</a>, incluidos los requisitos de Uso Limitado.</p>
      </Section>

      <Section title="Tus derechos y controles">
        <p>Desde <strong className="text-ink">Configuración</strong> puedes exportar tus datos y borrar tus datos financieros en cualquier momento. Para eliminar por completo tu cuenta y la información asociada, escríbenos y lo haremos.</p>
        <p>Puedes cerrar sesión cuando quieras; al hacerlo, la app retira tu sesión de ese dispositivo.</p>
      </Section>

      <Section title="Conservación">
        <p>Conservamos tus datos mientras mantengas tu cuenta. Si nos pides eliminarla, borraremos tu información, salvo lo que debamos conservar por obligación legal.</p>
      </Section>

      <Section title="Menores de edad">
        <p>La app no está dirigida a menores de 13 años y no recopilamos a sabiendas datos de menores de esa edad.</p>
      </Section>

      <Section title="Cambios en esta política">
        <p>Si cambiamos esta política, actualizaremos la fecha de arriba y, si el cambio es importante, te lo avisaremos dentro de la app.</p>
      </Section>

      <Section title="Contacto">
        {CONTACT_EMAIL ? <p>Escríbenos a <a className="text-ochre-ink underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p> : null}
        <ul className="flex flex-col gap-1.5">
          {CREDITS.map((credit) => <li key={credit.href}>
            <a className="text-ochre-ink underline underline-offset-2" href={credit.href} target="_blank" rel="noopener noreferrer">{credit.name}</a> · {credit.detail}
          </li>)}
        </ul>
      </Section>

      <SiteFooter className="mt-14" />
    </article>
  </main>;
}
