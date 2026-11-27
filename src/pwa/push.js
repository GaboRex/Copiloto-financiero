// Notificaciones push: suscribir este dispositivo y guardarlo en Supabase.
import { supabase } from "../services/supabase/client.js";
import { isIOS, isStandalone } from "./pwa.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

// Estado de las notificaciones en este dispositivo:
// "unconfigured" (falta la clave pública), "unsupported", "needs-install" (iPhone sin instalar),
// "default" (aún no se preguntó), "denied" (bloqueadas) o "granted".
export function pushAvailability() {
  if (!VAPID_PUBLIC_KEY || !supabase) return "unconfigured";
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  return Notification.permission;
}

async function registration() {
  // Con timeout: si el service worker no está registrado (p. ej. en desarrollo), no esperar para siempre.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error("El service worker no está activo.")), 8000)),
  ]);
}

export async function currentSubscription() {
  if (pushAvailability() !== "granted") return null;
  try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
}

// Pide permiso (solo tras un toque del usuario) y registra el dispositivo.
export async function enablePush() {
  const availability = pushAvailability();
  if (availability === "unconfigured" || availability === "unsupported" || availability === "needs-install") return { ok: false, reason: availability };
  const permission = availability === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };
  const reg = await registration();
  const subscription = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  const json = subscription.toJSON();
  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) return { ok: false, reason: "server", error };
  return { ok: true, settings: data };
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true };
  await supabase?.rpc("delete_push_subscription", { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
  return { ok: true };
}

export async function loadNotificationSettings() {
  const { data, error } = await supabase.rpc("get_notification_settings");
  if (error) throw error;
  return data;
}

export async function saveNotificationSettings(settings) {
  const { data, error } = await supabase.rpc("save_notification_settings", { p_settings: settings });
  if (error) throw error;
  return data;
}
