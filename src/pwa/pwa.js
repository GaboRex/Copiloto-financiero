// Instalación como app (PWA) y preferencias de interfaz que viven en el dispositivo.
import { useEffect, useState } from "react";

// ---- Registro del service worker ----
// En desarrollo se omite (interfiere con la recarga en caliente de Vite) salvo
// que se active con VITE_ENABLE_SW=true para probar.
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD && import.meta.env.VITE_ENABLE_SW !== "true") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.error("No se pudo registrar el service worker", error));
  });
}

// ---- Evento de instalación (Chrome, Edge, Android) ----
// El navegador lo dispara una sola vez y muy temprano: se captura al cargar el módulo.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // Usamos nuestro propio botón en vez del aviso genérico.
    deferredPrompt = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  // iPadOS se presenta como Mac con pantalla táctil.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((value) => value + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const standalone = isStandalone();
  const ios = isIOS();
  return {
    standalone,
    ios,
    // Android/PC: hay aviso nativo. iPhone: no existe, se muestran instrucciones.
    canInstall: !standalone && (Boolean(deferredPrompt) || ios),
    nativePrompt: Boolean(deferredPrompt),
    async promptInstall() {
      if (!deferredPrompt) return "unavailable";
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notify();
      return outcome; // "accepted" | "dismissed"
    },
  };
}

// ---- Avisos descartados en este dispositivo ----
const DISMISSED_KEY = "copiloto-financiero:ui-dismissed";

export function readDismissed(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(DISMISSED_KEY) || "{}") || {}; } catch { return {}; }
}

export function dismiss(key, storage = globalThis.localStorage) {
  const current = readDismissed(storage);
  current[key] = new Date().toISOString();
  // Se conservan solo los 200 más recientes para que no crezca sin límite.
  const entries = Object.entries(current).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 200);
  try { storage?.setItem(DISMISSED_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* almacenamiento bloqueado */ }
}

export function useDismissed() {
  const [dismissed, setDismissed] = useState(readDismissed);
  return {
    isDismissed: (key) => Boolean(dismissed[key]),
    dismiss: (key) => { dismiss(key); setDismissed(readDismissed()); },
  };
}
