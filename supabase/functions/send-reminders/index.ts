// Edge Function: envía los recordatorios push del día.
//
// La lógica (a quién y qué avisar, sin repetir) vive en la función SQL
// public.claim_due_push_reminders(); aquí solo se envían las notificaciones.
// La invoca un Cron diario de Supabase con la cabecera "x-cron-secret".
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee Supabase automáticamente.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Método no permitido", { status: 405 });
  if (request.headers.get("x-cron-secret") !== env("CRON_SECRET")) return new Response("No autorizado", { status: 401 });

  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: rows, error } = await supabase.rpc("claim_due_push_reminders");
  if (error) {
    console.error("claim_due_push_reminders", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const payload = JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.key });
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
      sent += 1;
    } catch (sendError) {
      const status = (sendError as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // El navegador revocó la suscripción: se elimina para no reintentar.
        await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        removed += 1;
      } else {
        failed += 1;
        console.error("No se pudo enviar", status, sendError);
      }
    }
  }

  return Response.json({ ok: true, candidates: rows?.length ?? 0, sent, removed, failed });
});
