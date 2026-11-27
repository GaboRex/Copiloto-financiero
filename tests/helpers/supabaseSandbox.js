// Postgres embebido (PGlite) con un esquema `auth` mínimo, compatible con lo
// que usan las migraciones: auth.users y auth.uid() leyendo request.jwt.claims.
// Permite ejecutar las migraciones y RPC reales sin Docker ni la CLI de Supabase.
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
`;

export async function createSandbox() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(AUTH_STUB);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) await db.exec(await readFile(new URL(file, dir), "utf8"));
  return db;
}

export async function addUser(db, id) {
  await db.query("insert into auth.users(id) values ($1) on conflict do nothing", [id]);
}

// Ejecuta `fn` como el rol `authenticated` con la sesión de `userId`, igual que
// PostgREST: dentro de una transacción con SET LOCAL ROLE y claims del JWT.
export async function asUser(db, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

export async function rpc(db, userId, name, args = {}) {
  const keys = Object.keys(args);
  const params = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
  const values = keys.map((key) => (args[key] !== null && typeof args[key] === "object" ? JSON.stringify(args[key]) : args[key]));
  const { rows } = await asUser(db, userId, (tx) => tx.query(`select public.${name}(${params}) as result`, values));
  return rows[0].result;
}

// Ejecuta una consulta como service_role (lo que usa la Edge Function).
export async function asService(db, fn) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}
