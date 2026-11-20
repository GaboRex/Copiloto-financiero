begin;
select plan(12);

insert into auth.users(id,aud,role,email,encrypted_password) values
  ('00000000-0000-0000-0000-00000000000a','authenticated','authenticated','a@example.test',''),
  ('00000000-0000-0000-0000-00000000000b','authenticated','authenticated','b@example.test','')
on conflict (id) do nothing;

-- Datos semilla como propietario: desde 202611200001 el rol authenticated solo lee
-- tablas y escribe exclusivamente mediante RPC.
insert into public.profiles(user_id,display_name) values
  ('00000000-0000-0000-0000-00000000000a','A'),
  ('00000000-0000-0000-0000-00000000000b','B');
insert into public.accounts(user_id,id,name,account_type,currency) values
  ('00000000-0000-0000-0000-00000000000a','a-cash','A cash','efectivo','BOB'),
  ('00000000-0000-0000-0000-00000000000b','b-cash','B cash','efectivo','BOB');
insert into public.transactions(user_id,id,transaction_type,description,amount_minor,currency,occurred_on,account_id) values ('00000000-0000-0000-0000-00000000000b','b-tx','ingreso','Privado',100,'BOB',current_date,'b-cash');
insert into public.goals(user_id,id,name,target_minor,current_minor,currency) values ('00000000-0000-0000-0000-00000000000b','b-goal','Meta B',10000,0,'BOB');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);

select is((select count(*)::integer from public.accounts),1,'A puede leer su cuenta y no la de B');
select is((select count(*)::integer from public.transactions),0,'A no puede leer movimientos de B');
select throws_ok($$insert into public.accounts(user_id,id,name,account_type,currency) values ('00000000-0000-0000-0000-00000000000a','direct','Directa','efectivo','BOB')$$,'42501',null,'A no puede escribir tablas directamente');
select throws_ok($$update public.accounts set name='hack'$$,'42501',null,'A no puede actualizar tablas directamente');
select throws_ok($$delete from public.accounts$$,'42501',null,'A no puede borrar filas directamente');
select throws_ok($$select public.apply_finance_state('{}'::jsonb,0,'x')$$,'42501',null,'La escritura completa queda reservada a la importación');
select throws_ok($$select public.apply_finance_changes('{"upsert":{"transactions":[{"id":"cross","type":"gasto","amount":1,"accountId":"b-cash","date":"2026-11-20"}]}}'::jsonb,0,'cross')$$,'23503',null,'A no puede relacionar una cuenta de B');
select throws_ok($$select public.apply_finance_changes('{"upsert":{"savingsContributions":[{"id":"cross-goal","kind":"goal","linkedGoalId":"b-goal","amount":1,"date":"2026-11-20"}]}}'::jsonb,0,'cross-goal')$$,'23503',null,'A no puede relacionar una meta de B');
select lives_ok($$select public.apply_finance_changes('{"remove":{"accounts":["b-cash"]}}'::jsonb,0,'cross-remove')$$,'Una baja con ids de B no falla pero no afecta a B');

reset role;
select is((select deleted_at from public.accounts where user_id='00000000-0000-0000-0000-00000000000b' and id='b-cash'),null,'La cuenta de B sigue activa');
select is((select name from public.accounts where user_id='00000000-0000-0000-0000-00000000000b' and id='b-cash'),'B cash','La cuenta de B no cambió');
set local role anon;
select throws_ok($$select count(*) from public.accounts$$,'42501',null,'Sin sesión no se leen cuentas');
select * from finish();
rollback;
