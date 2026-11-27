-- Presupuestos por proyecto o evento (viaje, mudanza, cumpleaños…).
--
-- * budgets: nombre, fechas opcionales y estado (active | closed).
-- * budget_items: partidas con monto planificado.
-- * transactions.budget_id / budget_item_id: enlace opcional de un gasto a su
--   presupuesto y partida. Las claves compuestas con user_id impiden enlazar
--   presupuestos de otra persona.
-- Las funciones se redefinen a partir de 202611200001 añadiendo solo lo de
-- presupuestos; el resto del comportamiento no cambia.

create table if not exists public.budgets (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  name text not null check (length(btrim(name)) > 0),
  start_on date, end_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  note text not null default '',
  currency char(3) not null check (currency in ('BOB', 'USD')),
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id, id), unique (id, user_id),
  check (start_on is null or end_on is null or end_on >= start_on)
);

create table if not exists public.budget_items (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null, budget_id text not null,
  name text not null check (length(btrim(name)) > 0),
  planned_minor bigint not null check (planned_minor >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id, id), unique (id, user_id),
  foreign key (budget_id, user_id) references public.budgets(id, user_id) on delete cascade
);
create index if not exists budget_items_budget_idx on public.budget_items(user_id, budget_id) where deleted_at is null;

alter table public.transactions add column if not exists budget_id text;
alter table public.transactions add column if not exists budget_item_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_budget_fk') then
    alter table public.transactions add constraint transactions_budget_fk foreign key (budget_id, user_id) references public.budgets(id, user_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_budget_item_fk') then
    alter table public.transactions add constraint transactions_budget_item_fk foreign key (budget_item_id, user_id) references public.budget_items(id, user_id) on delete restrict;
  end if;
end $$;
create index if not exists transactions_budget_idx on public.transactions(user_id, budget_id) where budget_id is not null and deleted_at is null;

-- Igual que el resto: RLS, solo lectura propia para el cliente; escritura vía RPC.
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;
do $$ declare t text; begin
  foreach t in array array['budgets', 'budget_items'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
  end loop;
end $$;

create or replace function finance_private.apply_changes(u uuid, p jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  cur char(3);
  a jsonb; t jsonb; g jsonb; d jsonb; c jsonb;
  ttype text; amt bigint; delta bigint; tx_currency char(3);
  b jsonb; bi jsonb; item_ids text[]; item_position integer;
begin
  if jsonb_typeof(p->'profile') = 'object' then
    update public.profiles set
      display_name = coalesce(p#>>'{profile,name}', ''),
      primary_currency = coalesce(p#>>'{profile,currency}', primary_currency),
      employment_type = coalesce(p#>>'{profile,employmentType}', ''),
      estimated_income_minor = finance_private.minor(p#>>'{profile,estimatedMonthlyIncome}'),
      onboarding_completed = coalesce((p#>>'{profile,onboardingCompleted}')::boolean, false),
      updated_at = now()
    where user_id = u;
  end if;
  select primary_currency into cur from public.profiles where user_id = u;

  for a in select value from jsonb_array_elements(coalesce(p#>'{upsert,accounts}', '[]')) loop
    insert into public.accounts(user_id, id, name, account_type, currency, opened_on, created_at)
    values (u, a->>'id', a->>'name', a->>'type', coalesce(a->>'currency', cur),
            coalesce((a->>'createdAt')::timestamptz, now())::date, coalesce((a->>'createdAt')::timestamptz, now()))
    on conflict (user_id, id) do update set
      name = excluded.name, account_type = excluded.account_type, currency = excluded.currency,
      updated_at = now(), deleted_at = null, version = public.accounts.version + 1;
    if a->>'type' = 'tarjeta_credito' then
      insert into public.credit_cards(user_id, account_id, credit_limit_minor, statement_day, payment_day, minimum_payment_minor, annual_rate)
      values (u, a->>'id', finance_private.minor_or_null(a->>'creditLimit'), finance_private.num(a->>'statementDay')::smallint,
              finance_private.num(a->>'paymentDay')::smallint, finance_private.minor_or_null(a->>'minimumPayment'), finance_private.num(a->>'rate'))
      on conflict (user_id, account_id) do update set
        credit_limit_minor = excluded.credit_limit_minor, statement_day = excluded.statement_day, payment_day = excluded.payment_day,
        minimum_payment_minor = excluded.minimum_payment_minor, annual_rate = excluded.annual_rate, updated_at = now();
    else
      delete from public.credit_cards where user_id = u and account_id = a->>'id';
    end if;
  end loop;

  for g in select value from jsonb_array_elements(coalesce(p#>'{upsert,goals}', '[]')) loop
    insert into public.goals(user_id, id, name, target_minor, current_minor, currency, monthly_commitment_minor, contribution_day, target_on)
    values (u, g->>'id', g->>'name', finance_private.minor(g->>'target'), finance_private.minor(g->>'current'), cur,
            finance_private.minor(g->>'monthlyContribution'), finance_private.num(g->>'contributionDay')::smallint, nullif(g->>'targetDate', '')::date)
    on conflict (user_id, id) do update set
      name = excluded.name, target_minor = excluded.target_minor, current_minor = excluded.current_minor,
      monthly_commitment_minor = excluded.monthly_commitment_minor, contribution_day = excluded.contribution_day,
      target_on = excluded.target_on, updated_at = now(), deleted_at = null, version = public.goals.version + 1;
  end loop;

  for b in select value from jsonb_array_elements(coalesce(p#>'{upsert,budgets}', '[]')) loop
    insert into public.budgets(user_id, id, name, start_on, end_on, status, note, currency, created_at)
    values (u, b->>'id', btrim(coalesce(b->>'name', '')), nullif(b->>'startDate', '')::date, nullif(b->>'endDate', '')::date,
            coalesce(nullif(b->>'status', ''), 'active'), coalesce(b->>'note', ''), cur, coalesce((b->>'createdAt')::timestamptz, now()))
    on conflict (user_id, id) do update set
      name = excluded.name, start_on = excluded.start_on, end_on = excluded.end_on, status = excluded.status,
      note = excluded.note, updated_at = now(), deleted_at = null, version = public.budgets.version + 1;
    item_ids := array[]::text[];
    item_position := 0;
    for bi in select value from jsonb_array_elements(coalesce(b->'items', '[]')) loop
      insert into public.budget_items(user_id, id, budget_id, name, planned_minor, position)
      values (u, bi->>'id', b->>'id', btrim(coalesce(bi->>'name', '')), finance_private.minor(bi->>'planned'), item_position)
      on conflict (user_id, id) do update set
        budget_id = excluded.budget_id, name = excluded.name, planned_minor = excluded.planned_minor,
        position = excluded.position, updated_at = now(), deleted_at = null;
      item_ids := item_ids || (bi->>'id');
      item_position := item_position + 1;
    end loop;
    -- Partidas que ya no vienen en el presupuesto: baja lógica.
    update public.budget_items set deleted_at = now(), updated_at = now()
      where user_id = u and budget_id = b->>'id' and deleted_at is null and not (id = any(item_ids));
  end loop;

  for t in select value from jsonb_array_elements(coalesce(p#>'{upsert,transactions}', '[]')) loop
    ttype := t->>'type';
    amt := finance_private.minor(t->>'amount');
    delta := case ttype when 'ingreso' then amt when 'gasto' then -amt else finance_private.minor(t->>'balanceDelta') end;
    if ttype in ('ajuste', 'transferencia') and (finance_private.num(t->>'balanceDelta') is null or abs(delta) <> amt) then
      raise exception 'invalid balance delta for transaction %', t->>'id' using errcode = '22023';
    end if;
    tx_currency := coalesce(t->>'currency', cur);
    insert into public.transactions(user_id, id, transaction_type, description, amount_minor, currency, occurred_on, category_code, payment_method,
                                    origin, generated, account_id, recurring_id, linked_debt_id, transfer_group_id, idempotency_key,
                                    budget_id, budget_item_id)
    values (u, t->>'id', ttype, coalesce(t->>'description', ''), amt, tx_currency, (t->>'date')::date, t->>'category', t->>'paymentMethod',
            coalesce(t->>'origin', 'user'), coalesce((t->>'generated')::boolean, false), t->>'accountId', t->>'recurringId', t->>'linkedDebtId',
            t->>'transferGroupId', case when t->>'origin' = 'initial_balance' then 'initial:' || (t->>'accountId') else null end,
            nullif(t->>'budgetId', ''), case when nullif(t->>'budgetId', '') is null then null else nullif(t->>'budgetItemId', '') end)
    on conflict (user_id, id) do update set
      transaction_type = excluded.transaction_type, description = excluded.description, amount_minor = excluded.amount_minor,
      currency = excluded.currency, occurred_on = excluded.occurred_on, category_code = excluded.category_code,
      payment_method = excluded.payment_method, origin = excluded.origin, generated = excluded.generated, account_id = excluded.account_id,
      recurring_id = excluded.recurring_id, linked_debt_id = excluded.linked_debt_id, transfer_group_id = excluded.transfer_group_id,
      budget_id = excluded.budget_id, budget_item_id = excluded.budget_item_id,
      updated_at = now(), deleted_at = null, version = public.transactions.version + 1;
    if t->>'accountId' is null then
      delete from public.transaction_entries where user_id = u and transaction_id = t->>'id';
    else
      insert into public.transaction_entries(user_id, id, transaction_id, account_id, delta_minor, currency)
      values (u, (t->>'id') || ':entry', t->>'id', t->>'accountId', delta, tx_currency)
      on conflict (user_id, id) do update set account_id = excluded.account_id, delta_minor = excluded.delta_minor, currency = excluded.currency;
    end if;
  end loop;

  for d in select value from jsonb_array_elements(coalesce(p#>'{upsert,debts}', '[]')) loop
    insert into public.debts(user_id, id, name, entity, debt_type, principal_minor, balance_minor, currency, annual_rate, installment_minor,
                             frequency, payment_day, term_months, remaining_installments, linked_account_id)
    values (u, d->>'id', d->>'name', coalesce(d->>'entity', ''), coalesce(d->>'type', 'otro'), finance_private.minor(d->>'principal'),
            finance_private.minor(d->>'balance'), cur, coalesce(finance_private.num(d->>'rate'), 0), finance_private.minor(d->>'installment'),
            coalesce(d->>'frequency', 'mensual'), finance_private.num(d->>'paymentDay')::smallint, finance_private.num(d->>'termMonths')::integer,
            finance_private.num(d->>'remainingInstallments')::integer, d->>'linkedAccountId')
    on conflict (user_id, id) do update set
      name = excluded.name, entity = excluded.entity, debt_type = excluded.debt_type, principal_minor = excluded.principal_minor,
      balance_minor = excluded.balance_minor, annual_rate = excluded.annual_rate, installment_minor = excluded.installment_minor,
      frequency = excluded.frequency, payment_day = excluded.payment_day, term_months = excluded.term_months,
      remaining_installments = excluded.remaining_installments, linked_account_id = excluded.linked_account_id,
      updated_at = now(), deleted_at = null, version = public.debts.version + 1;
  end loop;

  for c in
    select value || jsonb_build_object('kind', 'gasto') from jsonb_array_elements(coalesce(p#>'{upsert,recurringExpenses}', '[]'))
    union all
    select value || jsonb_build_object('kind', 'ingreso') from jsonb_array_elements(coalesce(p#>'{upsert,recurringIncomes}', '[]'))
  loop
    insert into public.recurring_transactions(user_id, id, kind, name, amount_minor, currency, category_code, account_id, frequency,
                                              day_of_month, next_occurrence_on, active)
    values (u, c->>'id', c->>'kind', c->>'name', finance_private.minor(c->>'amount'), cur, c->>'category', c->>'accountId',
            coalesce(c->>'frequency', 'mensual'), finance_private.num(c->>'dayOfMonth')::smallint, nullif(c->>'nextDate', '')::date,
            coalesce((c->>'active')::boolean, true))
    on conflict (user_id, id) do update set
      kind = excluded.kind, name = excluded.name, amount_minor = excluded.amount_minor, category_code = excluded.category_code,
      account_id = excluded.account_id, frequency = excluded.frequency, day_of_month = excluded.day_of_month,
      next_occurrence_on = excluded.next_occurrence_on, active = excluded.active, updated_at = now(), deleted_at = null;
  end loop;

  for c in select value from jsonb_array_elements(coalesce(p#>'{upsert,savingsContributions}', '[]')) loop
    insert into public.savings_contributions(user_id, id, kind, goal_id, amount_minor, currency, contributed_on, origin)
    values (u, c->>'id', c->>'kind', c->>'linkedGoalId', finance_private.minor(c->>'amount'), cur, (c->>'date')::date, coalesce(c->>'origin', 'user'))
    on conflict (user_id, id) do update set
      kind = excluded.kind, goal_id = excluded.goal_id, amount_minor = excluded.amount_minor,
      contributed_on = excluded.contributed_on, updated_at = now(), deleted_at = null;
  end loop;

  -- Bajas lógicas: se conservan las filas para auditoría y conciliación.
  update public.transactions set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,transactions}', '[]')));
  update public.savings_contributions set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,savingsContributions}', '[]')));
  update public.recurring_transactions set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,recurring}', '[]')));
  update public.debts set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,debts}', '[]')));
  update public.budget_items set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and budget_id in (select jsonb_array_elements_text(coalesce(p#>'{remove,budgets}', '[]')));
  update public.budgets set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,budgets}', '[]')));
  update public.goals set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,goals}', '[]')));
  update public.accounts set deleted_at = now(), updated_at = now()
    where user_id = u and deleted_at is null and id in (select jsonb_array_elements_text(coalesce(p#>'{remove,accounts}', '[]')));

  if jsonb_typeof(p->'settings') = 'object' then
    insert into public.user_financial_settings(user_id, emergency_current_minor, emergency_months_target, emergency_configured,
      essential_expenses_configured, essential_category_ids, savings_target_type, savings_target_value, debt_status,
      expected_income_minor, expected_variable_expenses_minor, next_income_on, income_frequency, section_guides_seen, currency_history)
    values (u,
      finance_private.minor(p#>>'{settings,emergencyFund,current}'),
      coalesce(finance_private.num(p#>>'{settings,emergencyFund,monthsTarget}')::integer, 3),
      coalesce((p#>>'{settings,emergencyFund,configured}')::boolean, false),
      coalesce((p#>>'{settings,financialSettings,essentialExpensesConfigured}')::boolean, false),
      array(select jsonb_array_elements_text(coalesce(p#>'{settings,financialSettings,essentialCategoryIds}', '[]'))),
      coalesce(p#>>'{settings,financialSettings,savingsTargetType}', 'percentage'),
      finance_private.num(p#>>'{settings,financialSettings,savingsTargetValue}'),
      coalesce(p#>>'{settings,financialSettings,debtStatus}', 'unconfigured'),
      finance_private.minor_or_null(p#>>'{settings,financialSettings,projection,expectedMonthlyIncome}'),
      finance_private.minor_or_null(p#>>'{settings,financialSettings,projection,expectedVariableExpenses}'),
      nullif(p#>>'{settings,financialSettings,projection,nextIncomeDate}', '')::date,
      coalesce(p#>>'{settings,financialSettings,projection,incomeFrequency}', 'mensual'),
      coalesce(p#>'{settings,sectionGuidesSeen}', '{}'),
      coalesce(p#>'{settings,currencyHistory}', '[]'))
    on conflict (user_id) do update set
      emergency_current_minor = excluded.emergency_current_minor, emergency_months_target = excluded.emergency_months_target,
      emergency_configured = excluded.emergency_configured, essential_expenses_configured = excluded.essential_expenses_configured,
      essential_category_ids = excluded.essential_category_ids, savings_target_type = excluded.savings_target_type,
      savings_target_value = excluded.savings_target_value, debt_status = excluded.debt_status,
      expected_income_minor = excluded.expected_income_minor, expected_variable_expenses_minor = excluded.expected_variable_expenses_minor,
      next_income_on = excluded.next_income_on, income_frequency = excluded.income_frequency,
      section_guides_seen = excluded.section_guides_seen, currency_history = excluded.currency_history, updated_at = now();
  end if;
end $$;

create or replace function public.get_finance_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); p public.profiles; s public.user_financial_settings; result jsonb;
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  insert into public.profiles(user_id) values (u) on conflict do nothing;
  insert into public.user_financial_settings(user_id) values (u) on conflict do nothing;
  select * into p from public.profiles where user_id = u;
  select * into s from public.user_financial_settings where user_id = u;
  select jsonb_build_object(
    'profile', jsonb_build_object('name', p.display_name, 'currency', p.primary_currency, 'employmentType', p.employment_type,
      'estimatedMonthlyIncome', public.from_minor(p.estimated_income_minor), 'onboardingCompleted', p.onboarding_completed),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'type', a.account_type, 'currency', a.currency,
        'balance', coalesce((bal.balances->>a.id)::numeric, 0),
        'creditLimit', case when c.credit_limit_minor is null then null else public.from_minor(c.credit_limit_minor) end,
        'statementDay', c.statement_day, 'paymentDay', c.payment_day,
        'minimumPayment', case when c.minimum_payment_minor is null then null else public.from_minor(c.minimum_payment_minor) end,
        'rate', c.annual_rate, 'createdAt', a.created_at) order by a.created_at, a.id)
      from public.accounts a
      cross join (select finance_private.account_balances(u) as balances) bal
      left join public.credit_cards c on c.user_id = a.user_id and c.account_id = a.id
      where a.user_id = u and a.deleted_at is null), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'type', t.transaction_type, 'description', t.description,
        'amount', public.from_minor(t.amount_minor), 'date', t.occurred_on, 'category', t.category_code, 'paymentMethod', t.payment_method,
        'accountId', t.account_id, 'linkedAccountId', t.account_id, 'recurringId', t.recurring_id, 'linkedDebtId', t.linked_debt_id,
        'transferGroupId', t.transfer_group_id, 'budgetId', t.budget_id, 'budgetItemId', t.budget_item_id, 'origin', t.origin, 'generated', t.generated, 'createdAt', t.created_at)
        || case when t.transaction_type in ('ajuste', 'transferencia') and e.delta_minor is not null
             then jsonb_build_object('balanceDelta', public.from_minor(e.delta_minor)) else '{}'::jsonb end
        order by t.occurred_on desc, t.created_at desc, t.id)
      from public.transactions t
      left join public.transaction_entries e on e.user_id = t.user_id and e.transaction_id = t.id and e.account_id = t.account_id
      where t.user_id = u and t.deleted_at is null), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'target', public.from_minor(target_minor),
        'current', public.from_minor(current_minor), 'monthlyContribution', public.from_minor(monthly_commitment_minor),
        'contributionDay', contribution_day, 'targetDate', target_on) order by created_at, id)
      from public.goals where user_id = u and deleted_at is null), '[]'::jsonb),
    'debts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'entity', entity, 'type', debt_type,
        'principal', public.from_minor(principal_minor), 'balance', public.from_minor(balance_minor), 'rate', annual_rate,
        'installment', public.from_minor(installment_minor), 'frequency', frequency, 'paymentDay', payment_day, 'termMonths', term_months,
        'remainingInstallments', remaining_installments, 'linkedAccountId', linked_account_id) order by created_at, id)
      from public.debts where user_id = u and deleted_at is null), '[]'::jsonb),
    'recurringExpenses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'amount', public.from_minor(amount_minor),
        'category', category_code, 'accountId', account_id, 'frequency', frequency, 'dayOfMonth', day_of_month,
        'nextDate', next_occurrence_on, 'active', active) order by created_at, id)
      from public.recurring_transactions where user_id = u and kind = 'gasto' and deleted_at is null), '[]'::jsonb),
    'recurringIncomes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'amount', public.from_minor(amount_minor),
        'category', category_code, 'accountId', account_id, 'frequency', frequency, 'dayOfMonth', day_of_month,
        'nextDate', next_occurrence_on, 'active', active) order by created_at, id)
      from public.recurring_transactions where user_id = u and kind = 'ingreso' and deleted_at is null), '[]'::jsonb),
    'savingsContributions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'linkedGoalId', goal_id,
        'amount', public.from_minor(amount_minor), 'date', contributed_on, 'origin', origin) order by created_at, id)
      from public.savings_contributions where user_id = u and deleted_at is null), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(jsonb_build_object('id', bg.id, 'name', bg.name, 'startDate', bg.start_on, 'endDate', bg.end_on,
        'status', bg.status, 'note', bg.note, 'createdAt', bg.created_at,
        'items', coalesce((select jsonb_agg(jsonb_build_object('id', it.id, 'name', it.name, 'planned', public.from_minor(it.planned_minor)) order by it.position, it.created_at)
          from public.budget_items it where it.user_id = u and it.budget_id = bg.id and it.deleted_at is null), '[]'::jsonb)) order by bg.created_at, bg.id)
      from public.budgets bg where bg.user_id = u and bg.deleted_at is null), '[]'::jsonb),
    'emergencyFund', jsonb_build_object('current', public.from_minor(s.emergency_current_minor), 'monthsTarget', s.emergency_months_target,
      'configured', s.emergency_configured),
    'financialSettings', jsonb_build_object('essentialExpensesConfigured', s.essential_expenses_configured,
      'essentialCategoryIds', to_jsonb(s.essential_category_ids), 'savingsTargetType', s.savings_target_type,
      'savingsTargetValue', s.savings_target_value, 'debtStatus', s.debt_status,
      'projection', jsonb_build_object(
        'expectedMonthlyIncome', case when s.expected_income_minor is null then null else public.from_minor(s.expected_income_minor) end,
        'expectedVariableExpenses', case when s.expected_variable_expenses_minor is null then null else public.from_minor(s.expected_variable_expenses_minor) end,
        'nextIncomeDate', s.next_income_on, 'incomeFrequency', s.income_frequency)),
    'sectionGuidesSeen', s.section_guides_seen, 'currencyHistory', s.currency_history, 'processedRequestIds', '[]'::jsonb, 'schemaVersion', 2
  ) into result;
  return jsonb_build_object('revision', p.data_revision, 'state', result);
end $$;

create or replace function public.apply_finance_state(p_state jsonb, p_expected_revision bigint, p_operation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); changes jsonb; next_revision bigint;
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform 1 from public.applied_operations where user_id = u and operation_id = p_operation_id;
  if found then return public.get_finance_state(); end if;

  insert into public.profiles(user_id) values (u) on conflict do nothing;
  perform 1 from public.profiles where user_id = u and data_revision = p_expected_revision for update;
  if not found then raise exception 'concurrent update' using errcode = '40001'; end if;

  changes := jsonb_build_object(
    'profile', p_state->'profile',
    'settings', jsonb_build_object('emergencyFund', p_state->'emergencyFund', 'financialSettings', p_state->'financialSettings',
      'sectionGuidesSeen', p_state->'sectionGuidesSeen', 'currencyHistory', p_state->'currencyHistory'),
    'upsert', jsonb_build_object(
      'accounts', coalesce(p_state->'accounts', '[]'), 'goals', coalesce(p_state->'goals', '[]'),
      'transactions', coalesce(p_state->'transactions', '[]'), 'debts', coalesce(p_state->'debts', '[]'),
      'recurringExpenses', coalesce(p_state->'recurringExpenses', '[]'), 'recurringIncomes', coalesce(p_state->'recurringIncomes', '[]'),
      'savingsContributions', coalesce(p_state->'savingsContributions', '[]'), 'budgets', coalesce(p_state->'budgets', '[]')),
    'remove', jsonb_build_object(
      'accounts', (select coalesce(jsonb_agg(x.id), '[]') from public.accounts x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'accounts', '[]')) s where s->>'id' = x.id)),
      'budgets', (select coalesce(jsonb_agg(x.id), '[]') from public.budgets x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'budgets', '[]')) s where s->>'id' = x.id)),
      'goals', (select coalesce(jsonb_agg(x.id), '[]') from public.goals x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'goals', '[]')) s where s->>'id' = x.id)),
      'transactions', (select coalesce(jsonb_agg(x.id), '[]') from public.transactions x where x.user_id = u and x.deleted_at is null
        and x.origin <> 'migration_balance'
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'transactions', '[]')) s where s->>'id' = x.id)),
      'debts', (select coalesce(jsonb_agg(x.id), '[]') from public.debts x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'debts', '[]')) s where s->>'id' = x.id)),
      'recurring', (select coalesce(jsonb_agg(x.id), '[]') from public.recurring_transactions x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'recurringExpenses', '[]') || coalesce(p_state->'recurringIncomes', '[]')) s where s->>'id' = x.id)),
      'savingsContributions', (select coalesce(jsonb_agg(x.id), '[]') from public.savings_contributions x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'savingsContributions', '[]')) s where s->>'id' = x.id))));

  perform finance_private.apply_changes(u, changes);
  perform finance_private.reconcile_balances(u, p_state->'accounts');
  update public.profiles set data_revision = data_revision + 1, updated_at = now() where user_id = u returning data_revision into next_revision;
  insert into public.applied_operations(user_id, operation_id, result) values (u, p_operation_id, jsonb_build_object('revision', next_revision));
  return public.get_finance_state();
end $$;

-- Mismos permisos que en 202611200001.
revoke all on all functions in schema finance_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on all functions in schema finance_private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on all functions in schema finance_private from authenticated'; end if;
end $$;
revoke all on function public.apply_finance_state(jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.get_finance_state() from public, anon;
grant execute on function public.get_finance_state() to authenticated;
