-- Sincronización incremental y saldos calculados por el servidor.
--
-- Cambios respecto a 202609150001:
-- 1. get_finance_state fallaba siempre: sum(bigint) devuelve numeric y no existe
--    from_minor(numeric). Ahora se convierte a bigint antes de formatear.
-- 2. apply_finance_changes recibe solo lo que cambió (altas/ediciones y bajas por id)
--    en lugar del estado completo. Los saldos se derivan del libro y el servidor
--    devuelve los saldos oficiales; ya no se acepta el saldo calculado por el cliente.
-- 3. applied_operations guarda solo la revisión (no una copia del estado) y se poda
--    a 30 días.
-- 4. El ajuste "migration_balance" se recalcula excluyéndose a sí mismo (antes un
--    segundo desajuste sobrescribía el primero y dejaba el saldo mal).
-- 5. El rol authenticated solo puede leer tablas; toda escritura pasa por funciones
--    SECURITY DEFINER que validan auth.uid() y filtran por user_id explícitamente.
-- 6. Movimientos ingreso/gasto: el delta se deriva de tipo y monto. Solo ajustes y
--    transferencias llevan balanceDelta, y debe coincidir con el monto.

create schema if not exists finance_private;
revoke all on schema finance_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema finance_private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema finance_private from authenticated'; end if;
end $$;

-- Utilidades de conversión tolerantes a cadenas vacías.
create or replace function finance_private.num(value text) returns numeric
language sql immutable set search_path = '' as $$
  select nullif(btrim(value), '')::numeric
$$;

create or replace function finance_private.minor(value text) returns bigint
language sql immutable set search_path = '' as $$
  select round(coalesce(finance_private.num(value), 0) * 100)::bigint
$$;

create or replace function finance_private.minor_or_null(value text) returns bigint
language sql immutable set search_path = '' as $$
  select case when finance_private.num(value) is null then null else round(finance_private.num(value) * 100)::bigint end
$$;

create or replace function finance_private.account_balances(u uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(a.id, coalesce(b.total, 0)::numeric / 100), '{}'::jsonb)
  from public.accounts a
  left join (
    select e.account_id, sum(e.delta_minor)::bigint as total
    from public.transaction_entries e
    join public.transactions x on x.user_id = e.user_id and x.id = e.transaction_id and x.deleted_at is null
    where e.user_id = u
    group by e.account_id
  ) b on b.account_id = a.id
  where a.user_id = u and a.deleted_at is null
$$;

-- Aplica un conjunto de cambios para el usuario u. Formato de p:
-- { profile?: {...}, settings?: { emergencyFund, financialSettings, sectionGuidesSeen, currencyHistory },
--   upsert: { accounts, goals, transactions, debts, recurringExpenses, recurringIncomes, savingsContributions },
--   remove: { accounts, goals, transactions, debts, recurring, savingsContributions } }  (listas de ids)
create or replace function finance_private.apply_changes(u uuid, p jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  cur char(3);
  a jsonb; t jsonb; g jsonb; d jsonb; c jsonb;
  ttype text; amt bigint; delta bigint; tx_currency char(3);
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

  for t in select value from jsonb_array_elements(coalesce(p#>'{upsert,transactions}', '[]')) loop
    ttype := t->>'type';
    amt := finance_private.minor(t->>'amount');
    delta := case ttype when 'ingreso' then amt when 'gasto' then -amt else finance_private.minor(t->>'balanceDelta') end;
    if ttype in ('ajuste', 'transferencia') and (finance_private.num(t->>'balanceDelta') is null or abs(delta) <> amt) then
      raise exception 'invalid balance delta for transaction %', t->>'id' using errcode = '22023';
    end if;
    tx_currency := coalesce(t->>'currency', cur);
    insert into public.transactions(user_id, id, transaction_type, description, amount_minor, currency, occurred_on, category_code, payment_method,
                                    origin, generated, account_id, recurring_id, linked_debt_id, transfer_group_id, idempotency_key)
    values (u, t->>'id', ttype, coalesce(t->>'description', ''), amt, tx_currency, (t->>'date')::date, t->>'category', t->>'paymentMethod',
            coalesce(t->>'origin', 'user'), coalesce((t->>'generated')::boolean, false), t->>'accountId', t->>'recurringId', t->>'linkedDebtId',
            t->>'transferGroupId', case when t->>'origin' = 'initial_balance' then 'initial:' || (t->>'accountId') else null end)
    on conflict (user_id, id) do update set
      transaction_type = excluded.transaction_type, description = excluded.description, amount_minor = excluded.amount_minor,
      currency = excluded.currency, occurred_on = excluded.occurred_on, category_code = excluded.category_code,
      payment_method = excluded.payment_method, origin = excluded.origin, generated = excluded.generated, account_id = excluded.account_id,
      recurring_id = excluded.recurring_id, linked_debt_id = excluded.linked_debt_id, transfer_group_id = excluded.transfer_group_id,
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

-- Solo para importaciones: hace que el libro explique el saldo que traía el navegador.
-- El ajuste se calcula excluyéndose a sí mismo, por lo que repetirlo es idempotente.
create or replace function finance_private.reconcile_balances(u uuid, p_accounts jsonb) returns void
language plpgsql set search_path = '' as $$
declare a jsonb; mig text; target bigint; actual bigint; delta bigint; acc_currency char(3);
begin
  for a in select value from jsonb_array_elements(coalesce(p_accounts, '[]')) loop
    continue when finance_private.num(a->>'balance') is null;
    mig := (a->>'id') || '-migration-balance';
    target := finance_private.minor(a->>'balance');
    select coalesce(sum(e.delta_minor), 0) into actual
      from public.transaction_entries e
      join public.transactions x on x.user_id = e.user_id and x.id = e.transaction_id
      where e.user_id = u and e.account_id = a->>'id' and x.deleted_at is null and x.id <> mig;
    delta := target - actual;
    if delta = 0 then
      update public.transactions set deleted_at = now(), updated_at = now() where user_id = u and id = mig and deleted_at is null;
    else
      select currency into acc_currency from public.accounts where user_id = u and id = a->>'id';
      insert into public.transactions(user_id, id, transaction_type, description, amount_minor, currency, occurred_on, category_code,
                                      origin, generated, account_id, idempotency_key)
      values (u, mig, 'ajuste', 'Ajuste de migración — ' || (a->>'name'), abs(delta), acc_currency, current_date, 'ajuste_saldo',
              'migration_balance', true, a->>'id', 'migration-balance:' || (a->>'id'))
      on conflict (user_id, id) do update set amount_minor = excluded.amount_minor, deleted_at = null, updated_at = now();
      insert into public.transaction_entries(user_id, id, transaction_id, account_id, delta_minor, currency)
      values (u, mig || ':entry', mig, a->>'id', delta, acc_currency)
      on conflict (user_id, id) do update set delta_minor = excluded.delta_minor, account_id = excluded.account_id;
    end if;
  end loop;
end $$;

-- Lectura completa del estado. Corrige el tipo de la suma de saldos y solo expone
-- balanceDelta en ajustes y transferencias (en ingresos y gastos se deriva del monto).
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
        'transferGroupId', t.transfer_group_id, 'origin', t.origin, 'generated', t.generated, 'createdAt', t.created_at)
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

-- Escritura incremental: lo que usa la app en cada acción.
create or replace function public.apply_finance_changes(p_changes jsonb, p_expected_revision bigint, p_operation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r jsonb; next_revision bigint;
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_operation_id is null or length(p_operation_id) = 0 or length(p_operation_id) > 200 then
    raise exception 'operation id required' using errcode = '22023';
  end if;
  select result into r from public.applied_operations where user_id = u and operation_id = p_operation_id;
  if found then return r || jsonb_build_object('balances', finance_private.account_balances(u), 'replayed', true); end if;

  insert into public.profiles(user_id) values (u) on conflict do nothing;
  perform 1 from public.profiles where user_id = u and data_revision = p_expected_revision for update;
  if not found then raise exception 'concurrent update' using errcode = '40001'; end if;

  perform finance_private.apply_changes(u, coalesce(p_changes, '{}'::jsonb));
  update public.profiles set data_revision = data_revision + 1, updated_at = now() where user_id = u returning data_revision into next_revision;

  r := jsonb_build_object('revision', next_revision);
  insert into public.applied_operations(user_id, operation_id, result) values (u, p_operation_id, r);
  delete from public.applied_operations where user_id = u and created_at < now() - interval '30 days';
  return r || jsonb_build_object('balances', finance_private.account_balances(u));
end $$;

-- Escritura completa: solo la usa la importación desde el navegador. Calcula las bajas
-- comparando con lo guardado y concilia saldos con un ajuste trazable.
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
      'savingsContributions', coalesce(p_state->'savingsContributions', '[]')),
    'remove', jsonb_build_object(
      'accounts', (select coalesce(jsonb_agg(x.id), '[]') from public.accounts x where x.user_id = u and x.deleted_at is null
        and not exists (select 1 from jsonb_array_elements(coalesce(p_state->'accounts', '[]')) s where s->>'id' = x.id)),
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

create or replace function public.import_local_finance_state(p_state jsonb, p_migration_id text, p_fingerprint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); existing public.local_import_batches; revision bigint; result jsonb;
begin
  if u is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into existing from public.local_import_batches where user_id = u and (migration_id = p_migration_id or fingerprint = p_fingerprint) limit 1;
  if found and existing.status = 'completed' then return public.get_finance_state() || jsonb_build_object('alreadyImported', true); end if;
  if public.has_finance_data() then raise exception 'remote data exists' using errcode = 'P0001'; end if;
  insert into public.profiles(user_id) values (u) on conflict do nothing;
  select data_revision into revision from public.profiles where user_id = u;
  insert into public.local_import_batches(user_id, migration_id, fingerprint, status, summary)
  values (u, p_migration_id, p_fingerprint, 'running', jsonb_build_object(
    'accounts', jsonb_array_length(coalesce(p_state->'accounts', '[]')), 'transactions', jsonb_array_length(coalesce(p_state->'transactions', '[]'))))
  on conflict (user_id, migration_id) do update set status = 'running';
  result := public.apply_finance_state(p_state, revision, 'import:' || p_migration_id);
  update public.local_import_batches set status = 'completed', completed_at = now() where user_id = u and migration_id = p_migration_id;
  return result || jsonb_build_object('alreadyImported', false, 'migrationId', p_migration_id);
end $$;

-- applied_operations ya no guarda copias completas del estado.
update public.applied_operations set result = jsonb_build_object('revision', result->'revision') where result ? 'state';

-- Las tablas pasan a ser de solo lectura para el cliente.
do $$ declare t text; begin
  foreach t in array array['profiles','accounts','credit_cards','transactions','transaction_entries','goals','savings_contributions','debts',
                           'recurring_transactions','user_financial_settings','local_import_batches','applied_operations'] loop
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
  end loop;
end $$;

-- Supabase concede EXECUTE por defecto a anon/authenticated en funciones nuevas
-- (no vía PUBLIC), así que se revoca explícitamente a cada rol.
revoke all on all functions in schema finance_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on all functions in schema finance_private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on all functions in schema finance_private from authenticated'; end if;
end $$;
revoke all on function public.apply_finance_changes(jsonb, bigint, text) from public, anon;
revoke all on function public.apply_finance_state(jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.get_finance_state() from public, anon;
revoke all on function public.import_local_finance_state(jsonb, text, text) from public, anon;
grant execute on function public.apply_finance_changes(jsonb, bigint, text) to authenticated;
grant execute on function public.get_finance_state() to authenticated;
grant execute on function public.import_local_finance_state(jsonb, text, text) to authenticated;
