-- Notificaciones push (recordatorios con la app cerrada).
--
-- * push_subscriptions: un registro por navegador/dispositivo que aceptó avisos.
-- * notification_settings: qué recordatorios quiere cada persona y su zona horaria.
-- * notification_log: qué se envió (clave por periodo) para no repetir avisos.
-- * claim_due_push_reminders(): decide qué enviar hoy, lo registra en el log y
--   devuelve los envíos. Solo la ejecuta service_role (la Edge Function).

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null, auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payday boolean not null default true,
  due boolean not null default true,
  budgets boolean not null default true,
  inactivity boolean not null default true,
  month boolean not null default true,
  timezone text not null default 'America/La_Paz',
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_log enable row level security;
do $$ declare t text; begin
  foreach t in array array['push_subscriptions', 'notification_settings', 'notification_log'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
  end loop;
end $$;

-- ---- RPC para la app (usuario autenticado) ----

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '', p_timezone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid subscription' using errcode = '22023';
  end if;
  -- Un mismo navegador puede pasar de una cuenta a otra: el endpoint se reasigna.
  insert into public.push_subscriptions(endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, u, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now();
  insert into public.notification_settings(user_id, timezone) values (u, coalesce(nullif(p_timezone, ''), 'America/La_Paz'))
  on conflict (user_id) do update set timezone = coalesce(nullif(p_timezone, ''), public.notification_settings.timezone), updated_at = now();
  return public.get_notification_settings();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.get_notification_settings()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); s public.notification_settings;
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into s from public.notification_settings where user_id = u;
  return jsonb_build_object(
    'payday', coalesce(s.payday, true), 'due', coalesce(s.due, true), 'budgets', coalesce(s.budgets, true),
    'inactivity', coalesce(s.inactivity, true), 'month', coalesce(s.month, true),
    'timezone', coalesce(s.timezone, 'America/La_Paz'),
    'devices', (select count(*) from public.push_subscriptions where user_id = u));
end $$;

create or replace function public.save_notification_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  insert into public.notification_settings(user_id, payday, due, budgets, inactivity, month, timezone)
  values (u, coalesce((p_settings->>'payday')::boolean, true), coalesce((p_settings->>'due')::boolean, true),
          coalesce((p_settings->>'budgets')::boolean, true), coalesce((p_settings->>'inactivity')::boolean, true),
          coalesce((p_settings->>'month')::boolean, true), coalesce(nullif(p_settings->>'timezone', ''), 'America/La_Paz'))
  on conflict (user_id) do update set payday = excluded.payday, due = excluded.due, budgets = excluded.budgets,
    inactivity = excluded.inactivity, month = excluded.month,
    timezone = coalesce(nullif(p_settings->>'timezone', ''), public.notification_settings.timezone), updated_at = now();
  return public.get_notification_settings();
end $$;

-- ---- Selección diaria de recordatorios (solo service_role) ----

create or replace function finance_private.money_text(minor bigint, currency text) returns text
language sql immutable set search_path = '' as $$
  select case when currency = 'USD' then 'US$ ' else 'Bs ' end
    || replace(replace(replace(to_char(minor::numeric / 100, 'FM999,999,990.00'), ',', '_'), '.', ','), '_', '.')
$$;

create or replace function public.claim_due_push_reminders(p_now timestamptz default now())
returns table (user_id uuid, endpoint text, p256dh text, auth text, key text, title text, body text, url text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare months text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  return query
  with people as (
    -- Personas con al menos un dispositivo suscrito y su "hoy" en su zona horaria.
    select ns.user_id as uid, ns.*, (p_now at time zone ns.timezone)::date as today, coalesce(pr.primary_currency, 'BOB')::text as currency
    from public.notification_settings ns
    join public.profiles pr on pr.user_id = ns.user_id
    where exists (select 1 from public.push_subscriptions ps where ps.user_id = ns.user_id)
  ),
  dated as (
    select pe.*, date_trunc('month', pe.today)::date as month_start,
           (date_trunc('month', pe.today) + interval '1 month - 1 day')::date as month_end,
           to_char(pe.today, 'YYYY-MM') as ym
    from people pe
  ),
  candidates as (
    -- 1. Día de cobro (exactamente ese día; un cobro el 31 cae el último día de meses cortos).
    select d.uid, 1 as priority, 'payday:' || r.id || ':' || d.ym as k,
           'Hoy es día de cobro' as t,
           'Registra ' || r.name || ' (' || finance_private.money_text(r.amount_minor, d.currency) || ') con un toque.' as b, '/' as link
    from dated d join public.recurring_transactions r on r.user_id = d.uid
    where d.payday and r.kind = 'ingreso' and r.active and r.deleted_at is null
      and least(coalesce(r.day_of_month, 1), extract(day from d.month_end)::int) = extract(day from d.today)::int
      and not exists (select 1 from public.transactions x where x.user_id = d.uid and x.deleted_at is null and x.transaction_type = 'ingreso'
        and x.occurred_on between d.month_start and d.month_end
        and (x.recurring_id = r.id or lower(btrim(x.description)) = lower(btrim(r.name)) or (x.category_code = r.category_code and x.amount_minor = r.amount_minor)))
    union all
    -- 2. Gasto fijo que vence mañana (dentro del mismo mes) y aún no se pagó.
    select d.uid, 2, 'due:' || r.id || ':' || d.ym,
           'Mañana vence ' || r.name,
           finance_private.money_text(r.amount_minor, d.currency) || '. Cuando lo pagues, regístralo en Copiloto.', '/'
    from dated d join public.recurring_transactions r on r.user_id = d.uid
    where d.due and r.kind = 'gasto' and r.active and r.deleted_at is null and d.today < d.month_end
      and least(coalesce(r.day_of_month, 1), extract(day from d.month_end)::int) = extract(day from d.today + 1)::int
      and not exists (select 1 from public.transactions x where x.user_id = d.uid and x.deleted_at is null and x.transaction_type = 'gasto'
        and x.occurred_on between d.month_start and d.month_end
        and (x.recurring_id = r.id or lower(btrim(x.description)) = lower(btrim(r.name)) or (x.category_code = r.category_code and x.amount_minor = r.amount_minor)))
    union all
    -- 3. Partidas de presupuestos vigentes que pasaron el 80 % o el 100 %.
    select d.uid, case when s.spent > i.planned_minor then 3 else 4 end,
           case when s.spent > i.planned_minor then 'budget-over:' else 'budget-warning:' end || i.id,
           case when s.spent > i.planned_minor then 'Te pasaste en ' || i.name else i.name || ' está cerca del límite' end,
           bg.name || ': llevas ' || finance_private.money_text(s.spent, d.currency) || ' de ' || finance_private.money_text(i.planned_minor, d.currency) || '.',
           '/planes?tab=presupuestos'
    from dated d
    join public.budgets bg on bg.user_id = d.uid and bg.deleted_at is null and bg.status = 'active'
      and (bg.start_on is null or bg.start_on <= d.today) and (bg.end_on is null or bg.end_on >= d.today)
    join public.budget_items i on i.user_id = d.uid and i.budget_id = bg.id and i.deleted_at is null and i.planned_minor > 0
    cross join lateral (select coalesce(sum(x.amount_minor), 0)::bigint as spent from public.transactions x
      where x.user_id = d.uid and x.deleted_at is null and x.transaction_type = 'gasto' and x.budget_item_id = i.id) s
    where d.budgets and s.spent * 10 >= i.planned_minor * 8
    union all
    -- 4. Inactividad: 5 días o más sin movimientos reales.
    select d.uid, 6, 'inactive:' || last_tx::text, '¿Todo en orden?',
           'Llevas ' || (d.today - last_tx) || ' días sin registrar movimientos.', '/movimientos?nuevo=gasto'
    from dated d
    cross join lateral (select max(x.occurred_on) as last_tx from public.transactions x where x.user_id = d.uid and x.deleted_at is null
      and x.origin = 'user' and not x.generated and x.transaction_type in ('ingreso', 'gasto')) lt
    where d.inactivity and lt.last_tx is not null and d.today - lt.last_tx >= 5
    union all
    -- 5. Último día del mes.
    select d.uid, 7, 'monthend:' || d.ym, 'Hoy cierra ' || months[extract(month from d.today)::int],
           'Revisa cómo te fue este mes en Copiloto Financiero.', '/analisis'
    from dated d where d.month and d.today = d.month_end
  ),
  fresh as (
    -- Sin repetir lo ya enviado y como máximo 2 avisos por persona y día.
    select c.*, row_number() over (partition by c.uid order by c.priority, c.k) as n
    from candidates c
    where not exists (select 1 from public.notification_log l where l.user_id = c.uid and l.key = c.k)
  ),
  claimed as (
    insert into public.notification_log(user_id, key, sent_at)
    select f.uid, f.k, p_now from fresh f where f.n <= 2
    on conflict do nothing
    returning notification_log.user_id, notification_log.key
  )
  select f.uid, ps.endpoint, ps.p256dh, ps.auth, f.k, f.t, f.b, f.link
  from fresh f
  join claimed cl on cl.user_id = f.uid and cl.key = f.k
  join public.push_subscriptions ps on ps.user_id = f.uid
  order by f.uid, f.priority;

  -- El registro de envíos se poda a 120 días.
  delete from public.notification_log nl where nl.sent_at < p_now - interval '120 days';
end $$;

-- Permisos: la app usa las cuatro primeras; la selección diaria es solo para el servidor.
revoke all on function public.save_push_subscription(text, text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.get_notification_settings() from public, anon;
revoke all on function public.save_notification_settings(jsonb) from public, anon;
revoke all on function public.claim_due_push_reminders(timestamptz) from public, anon, authenticated;
revoke all on function finance_private.money_text(bigint, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.get_notification_settings() to authenticated;
grant execute on function public.save_notification_settings(jsonb) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.claim_due_push_reminders(timestamptz) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function finance_private.money_text(bigint, text) from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function finance_private.money_text(bigint, text) from authenticated'; end if;
end $$;
