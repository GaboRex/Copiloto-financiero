// Bandera del modo invitado. Vive en localStorage (no en el estado de React)
// para que recargar la página no expulse al invitado al login.
const GUEST_KEY = "copiloto-financiero:guest-mode";

export function readGuestFlag(storage = globalThis.localStorage) {
  try { return storage?.getItem(GUEST_KEY) === "1"; } catch { return false; }
}

export function writeGuestFlag(storage = globalThis.localStorage) {
  try { storage?.setItem(GUEST_KEY, "1"); } catch { /* almacenamiento bloqueado: el modo dura esta pestaña */ }
}

export function clearGuestFlag(storage = globalThis.localStorage) {
  try { storage?.removeItem(GUEST_KEY); } catch { /* sin almacenamiento disponible */ }
}
