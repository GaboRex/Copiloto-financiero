import React, { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CloudUpload, HardDrive, LogOut, Settings, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useFinanceState } from "../context/FinanceContext.jsx";
import { Button, Modal } from "./ui/primitives.jsx";

function useIdentity() {
  const auth = useAuth();
  const state = useFinanceState();
  const metadata = auth.user?.user_metadata || {};
  const fallback = auth.guest ? "Invitado" : "Tu cuenta";
  const name = state.profile?.name || metadata.full_name || metadata.name || auth.user?.email?.split("@")[0] || fallback;
  return { auth, name, email: auth.user?.email || "", avatarUrl: metadata.avatar_url || metadata.picture || "" };
}

// Salir de la sesión (cuenta) o del modo invitado, siempre de vuelta al login.
// Para el invitado se pide decidir qué hacer con los datos del navegador.
export function useSessionExit() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [guestDialog, setGuestDialog] = useState(false);

  async function exit() {
    if (busy) return;
    if (auth.guest) { setGuestDialog(true); return; }
    setBusy(true);
    await auth.signOut();
    navigate("/login", { replace: true });
  }

  function leaveGuest(clearData) {
    setGuestDialog(false);
    auth.exitGuest({ clearData });
    navigate("/login", { replace: true });
  }

  const dialog = <Modal open={guestDialog} onClose={() => setGuestDialog(false)} title="Salir del modo invitado">
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">Tus datos están guardados solo en este navegador. ¿Qué hacemos con ellos?</p>
      <div className="flex flex-col gap-2">
        <Button variant="danger" onClick={() => leaveGuest(true)}>Salir y borrar mis datos</Button>
        <Button variant="secondary" onClick={() => leaveGuest(false)}>Salir y conservarlos en este navegador</Button>
        <Button variant="ghost" onClick={() => setGuestDialog(false)}>Cancelar</Button>
      </div>
      <p className="text-xs text-ink-soft">Si este equipo es compartido, te recomendamos borrarlos o guardarlos antes en tu cuenta.</p>
    </div>
  </Modal>;

  return { exit, busy, dialog, label: auth.guest ? "Salir del modo invitado" : "Cerrar sesión" };
}

// Invitado → cuenta: inicia sesión con Google y, al volver, se ofrece importar los datos locales.
export function useSaveToCloud() {
  const auth = useAuth();
  const location = useLocation();
  const [working, setWorking] = useState(false);
  async function save() {
    setWorking(true);
    const result = await auth.signInWithGoogle(`${location.pathname}${location.search}`);
    if (result?.error) setWorking(false);
  }
  return { save, working, available: auth.guest && auth.configured };
}

export function Avatar({ name, avatarUrl, size = 32, guest = false }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  const style = { width: size, height: size };
  if (guest) return <span aria-hidden="true" className="rounded-full bg-paper-raised border border-line text-ink-soft grid place-items-center shrink-0" style={style}><UserRound size={Math.round(size * 0.55)} /></span>;
  if (avatarUrl && !failed) {
    return <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="rounded-full object-cover shrink-0 bg-paper-raised" style={style} />;
  }
  return <span aria-hidden="true" className="rounded-full bg-teal text-paper grid place-items-center text-xs font-semibold shrink-0" style={style}>{initials}</span>;
}

// Móvil: avatar en el encabezado que abre un menú.
export function UserMenu() {
  const { auth, name, email, avatarUrl } = useIdentity();
  const { exit, busy, dialog, label } = useSessionExit();
  const cloud = useSaveToCloud();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Modo local de desarrollo (sin cuenta ni invitado): solo Configuración.
  if (!auth.user && !auth.guest) {
    return <Link to="/configuracion" aria-label="Configuración" className="h-10 w-10 grid place-items-center rounded text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Settings size={20} aria-hidden="true" /></Link>;
  }

  const item = "flex items-center gap-3 rounded px-3 min-h-[44px] text-sm w-full focus-visible:outline-none";
  return <div ref={rootRef} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-label={auth.guest ? "Menú del modo invitado" : `Cuenta de ${name}`} onClick={() => setOpen((value) => !value)} className="h-10 w-10 grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
      <Avatar name={name} avatarUrl={avatarUrl} size={30} guest={auth.guest} />
    </button>
    {open ? <div id={menuId} role="menu" className="absolute right-0 top-12 w-64 rounded-lg border border-line bg-paper shadow-card p-1.5 z-50 origin-top-right animate-pop-in">
      <div className="px-3 py-2.5 border-b border-line mb-1">
        <p className="font-medium text-sm truncate">{name}</p>
        <p className="text-xs text-ink-soft truncate">{auth.guest ? "Modo invitado · datos en este navegador" : email}</p>
      </div>
      {cloud.available ? <button role="menuitem" type="button" onClick={cloud.save} disabled={cloud.working} className={`${item} text-teal font-medium hover:bg-teal/10 focus-visible:bg-teal/10`}><CloudUpload size={17} aria-hidden="true" />{cloud.working ? "Abriendo Google…" : "Guardar en la nube"}</button> : null}
      <Link role="menuitem" to="/configuracion" onClick={() => setOpen(false)} className={`${item} hover:bg-paper-raised focus-visible:bg-paper-raised`}><Settings size={17} aria-hidden="true" className="text-ink-soft" />Configuración</Link>
      <button role="menuitem" type="button" onClick={() => { setOpen(false); exit(); }} disabled={busy} className={`${item} text-brick hover:bg-brick/10 focus-visible:bg-brick/10 disabled:opacity-60`}><LogOut size={17} aria-hidden="true" />{busy ? "Cerrando sesión…" : label}</button>
    </div> : null}
    {dialog}
  </div>;
}

// Escritorio: tarjeta de cuenta al pie de la barra lateral.
export function SidebarAccount() {
  const { auth, name, email, avatarUrl } = useIdentity();
  const { exit, busy, dialog, label } = useSessionExit();
  const cloud = useSaveToCloud();
  if (!auth.user && !auth.guest) return null;
  return <div className="mt-2 rounded border border-line bg-paper-raised/50 p-2.5">
    <div className="flex items-center gap-2.5 px-0.5">
      <Avatar name={name} avatarUrl={avatarUrl} size={32} guest={auth.guest} />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-ink-soft truncate" title={email}>{auth.guest ? "Modo invitado" : email}</p>
      </div>
    </div>
    {cloud.available ? <button type="button" onClick={cloud.save} disabled={cloud.working} className="mt-2 w-full flex items-center justify-center gap-2 rounded min-h-[36px] text-sm font-medium bg-teal text-paper hover:bg-teal-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"><CloudUpload size={15} aria-hidden="true" />{cloud.working ? "Abriendo Google…" : "Guardar en la nube"}</button> : null}
    <button type="button" onClick={exit} disabled={busy} className="mt-2 w-full flex items-center justify-center gap-2 rounded min-h-[36px] text-sm text-ink-soft border border-line hover:text-brick hover:border-brick/40 hover:bg-brick/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"><LogOut size={15} aria-hidden="true" />{busy ? "Cerrando sesión…" : label}</button>
    {dialog}
  </div>;
}

// Aviso persistente del modo invitado, con la acción para pasar a una cuenta.
export function GuestBanner() {
  const auth = useAuth();
  const cloud = useSaveToCloud();
  if (!auth.guest) return null;
  return <div role="note" className="mb-5 flex items-center gap-3 rounded-lg border border-ochre/40 bg-ochre/10 px-3.5 py-2.5 text-sm animate-fade-in">
    <HardDrive size={18} className="text-ochre-ink shrink-0" aria-hidden="true" />
    <p className="flex-1 min-w-0 text-[#5C4113]"><span className="font-medium">Modo invitado.</span> <span className="hidden sm:inline">Tus datos se guardan solo en este navegador.</span><span className="sm:hidden">Datos solo en este navegador.</span></p>
    {cloud.available ? <button type="button" onClick={cloud.save} disabled={cloud.working} className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-ink text-paper px-3 min-h-[36px] text-xs font-medium hover:bg-[#34443E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"><CloudUpload size={14} aria-hidden="true" />{cloud.working ? "Abriendo…" : "Guardar"}<span className="hidden sm:inline">&nbsp;en la nube</span></button> : null}
  </div>;
}

// Onboarding: acceso discreto para salir (cuenta equivocada o fin del modo invitado).
export function OnboardingAccountBar() {
  const { auth, email } = useIdentity();
  const { exit, busy, dialog, label } = useSessionExit();
  if (!auth.user && !auth.guest) return null;
  return <div className="fixed top-3 right-3 z-40 flex items-center gap-2 rounded-full border border-line bg-paper/90 backdrop-blur pl-3 pr-1 py-1 text-xs text-ink-soft shadow-card animate-fade-in">
    <span className="hidden sm:inline max-w-[14rem] truncate">{auth.guest ? "Modo invitado" : email}</span>
    <button type="button" onClick={exit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-[36px] text-ink hover:bg-paper-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"><LogOut size={14} aria-hidden="true" />{busy ? "Saliendo…" : auth.guest ? "Salir" : label}</button>
    {dialog}
  </div>;
}

// Compatibilidad con el nombre anterior.
export const useSignOut = () => { const { exit, busy, dialog } = useSessionExit(); return { signOut: exit, busy, dialog }; };
