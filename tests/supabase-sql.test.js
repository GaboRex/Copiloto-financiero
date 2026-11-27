// Ejecuta las migraciones reales en Postgres embebido (PGlite) y prueba las RPC
// como el rol `authenticated`, igual que las llama la app a través de Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSandbox, addUser, rpc, asUser, asService } from "./helpers/supabaseSandbox.js";

// Una sola base para todo el archivo; cada test usa usuarios nuevos, así que el
// aislamiento entre tests lo da el propio RLS/filtrado por user_id.
let A;
let B;
const sandbox = createSandbox();

async function freshDb() {
  const db = await sandbox;
  A = randomUUID();
  B = randomUUID();
  await addUser(db, A);
  await addUser(db, B);
  return db;
}

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `se esperaba ${code} y llegó ${error.code}: ${error.message}`);
    return true;
  });
}

const cash = { id: "cash", name: "Caja", type: "efectivo", createdAt: "2026-11-01T10:00:00Z" };
const bank = { id: "bank", name: "Banco", type: "banco", createdAt: "2026-11-01T10:00:00Z" };
const opening = { id: "cash-initial-balance", type: "ingreso", amount: 100, accountId: "cash", date: "2026-11-01", origin: "initial_balance", generated: true };

async function seed(db) {
  return rpc(db, A, "apply_finance_changes", {
    p_changes: { upsert: { accounts: [cash, bank], transactions: [opening] } },
    p_expected_revision: 0,
    p_operation_id: "seed",
  });
}

test("get_finance_state carga un usuario nuevo (regresión: sum(bigint) es numeric)", async () => {
  const db = await freshDb();
  const loaded = await rpc(db, A, "get_finance_state");
  assert.equal(loaded.revision, 0);
  assert.deepEqual(loaded.state.accounts, []);
});

test("los saldos salen del libro y se ignora el saldo enviado por el cliente", async () => {
  const db = await freshDb();
  await seed(db);
  const result = await rpc(db, A, "apply_finance_changes", {
    p_changes: { upsert: {
      accounts: [{ ...cash, balance: 999999 }],
      transactions: [{ id: "g1", type: "gasto", amount: 30.5, accountId: "cash", date: "2026-11-02", balanceDelta: 500 }],
    } },
    p_expected_revision: 1,
    p_operation_id: "op-gasto",
  });
  assert.equal(result.revision, 2);
  assert.equal(Number(result.balances.cash), 69.5);
  const { state } = await rpc(db, A, "get_finance_state");
  assert.equal(Number(state.accounts.find((account) => account.id === "cash").balance), 69.5);
  assert.equal(state.transactions.find((transaction) => transaction.id === "g1").balanceDelta, undefined);
});

test("editar y borrar movimientos recalcula el saldo", async () => {
  const db = await freshDb();
  await seed(db);
  const expense = { id: "g1", type: "gasto", amount: 40, accountId: "cash", date: "2026-11-02" };
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { transactions: [expense] } }, p_expected_revision: 1, p_operation_id: "add" });
  let result = await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { transactions: [{ ...expense, amount: 55, accountId: "bank" }] } }, p_expected_revision: 2, p_operation_id: "edit" });
  assert.deepEqual([Number(result.balances.cash), Number(result.balances.bank)], [100, -55]);
  result = await rpc(db, A, "apply_finance_changes", { p_changes: { remove: { transactions: ["g1"] } }, p_expected_revision: 3, p_operation_id: "remove" });
  assert.deepEqual([Number(result.balances.cash), Number(result.balances.bank)], [100, 0]);
});

test("las transferencias exigen un delta coherente con el monto", async () => {
  const db = await freshDb();
  await seed(db);
  const common = { type: "transferencia", amount: 25, date: "2026-11-03", origin: "internal_transfer", generated: true, transferGroupId: "tr1" };
  const result = await rpc(db, A, "apply_finance_changes", {
    p_changes: { upsert: { transactions: [
      { ...common, id: "out", accountId: "cash", balanceDelta: -25 },
      { ...common, id: "in", accountId: "bank", balanceDelta: 25 },
    ] } },
    p_expected_revision: 1,
    p_operation_id: "transfer",
  });
  assert.deepEqual([Number(result.balances.cash), Number(result.balances.bank)], [75, 25]);
  await rejects(rpc(db, A, "apply_finance_changes", {
    p_changes: { upsert: { transactions: [{ ...common, id: "bad", accountId: "bank", balanceDelta: 9000 }] } },
    p_expected_revision: 2,
    p_operation_id: "bad-transfer",
  }), "22023");
});

test("una revisión vieja se rechaza con 40001 y no aplica cambios", async () => {
  const db = await freshDb();
  await seed(db);
  await rejects(rpc(db, A, "apply_finance_changes", {
    p_changes: { upsert: { transactions: [{ id: "late", type: "gasto", amount: 10, accountId: "cash", date: "2026-11-02" }] } },
    p_expected_revision: 0,
    p_operation_id: "stale",
  }), "40001");
  const { state } = await rpc(db, A, "get_finance_state");
  assert.equal(state.transactions.some((transaction) => transaction.id === "late"), false);
});

test("repetir una operación es idempotente y no guarda copias del estado", async () => {
  const db = await freshDb();
  await seed(db);
  const args = { p_changes: { upsert: { transactions: [{ id: "g1", type: "gasto", amount: 10, accountId: "cash", date: "2026-11-02" }] } }, p_expected_revision: 1, p_operation_id: "same-op" };
  const first = await rpc(db, A, "apply_finance_changes", args);
  const replay = await rpc(db, A, "apply_finance_changes", args);
  assert.equal(replay.revision, first.revision);
  assert.equal(replay.replayed, true);
  assert.equal(Number(replay.balances.cash), 90);
  const { rows } = await db.query("select result from public.applied_operations where user_id = $1", [A]);
  assert.ok(rows.length >= 2);
  for (const row of rows) assert.deepEqual(Object.keys(row.result), ["revision"]);
});

test("el cliente solo puede leer tablas; las escrituras directas se rechazan", async () => {
  const db = await freshDb();
  await seed(db);
  const own = await asUser(db, A, (tx) => tx.query("select count(*)::int as n from public.accounts"));
  assert.equal(own.rows[0].n, 2);
  await rejects(asUser(db, A, (tx) => tx.query("insert into public.accounts(user_id,id,name,account_type,currency) values ($1,'x','X','efectivo','BOB')", [A])), "42501");
  await rejects(asUser(db, A, (tx) => tx.query("update public.transaction_entries set delta_minor = 1")), "42501");
  await rejects(asUser(db, A, (tx) => tx.query("delete from public.transactions")), "42501");
  await rejects(rpc(db, A, "apply_finance_state", { p_state: {}, p_expected_revision: 1, p_operation_id: "x" }), "42501");
  await rejects(asUser(db, A, (tx) => tx.query("select finance_private.account_balances($1)", [B])), "42501");
});

test("cada usuario solo ve y modifica sus propios datos", async () => {
  const db = await freshDb();
  await seed(db);
  const other = await rpc(db, B, "get_finance_state");
  assert.deepEqual(other.state.accounts, []);
  const visible = await asUser(db, B, (tx) => tx.query("select count(*)::int as n from public.transactions"));
  assert.equal(visible.rows[0].n, 0);
  // B no puede mover dinero hacia una cuenta de A: la clave foránea incluye user_id.
  await rejects(rpc(db, B, "apply_finance_changes", {
    p_changes: { upsert: { transactions: [{ id: "steal", type: "ingreso", amount: 5, accountId: "cash", date: "2026-11-02" }] } },
    p_expected_revision: 0,
    p_operation_id: "cross",
  }), "23503");
  // Las bajas de B no afectan los ids de A.
  await rpc(db, B, "apply_finance_changes", { p_changes: { remove: { accounts: ["cash"], transactions: ["cash-initial-balance"] } }, p_expected_revision: 0, p_operation_id: "cross-remove" });
  const mine = await rpc(db, A, "get_finance_state");
  assert.equal(Number(mine.state.accounts.find((account) => account.id === "cash").balance), 100);
});

test("la importación concilia saldos antiguos y el ajuste se recalcula sin acumular errores", async () => {
  const db = await freshDb();
  const local = {
    profile: { name: "Ana", currency: "BOB", onboardingCompleted: true },
    accounts: [{ ...cash, balance: 250 }],
    transactions: [opening],
    goals: [], debts: [], recurringExpenses: [], recurringIncomes: [], savingsContributions: [],
  };
  const imported = await rpc(db, A, "import_local_finance_state", { p_state: local, p_migration_id: "m1", p_fingerprint: "f1" });
  assert.equal(imported.alreadyImported, false);
  assert.equal(Number(imported.state.accounts[0].balance), 250);
  const adjustment = imported.state.transactions.find((transaction) => transaction.origin === "migration_balance");
  assert.equal(Number(adjustment.amount), 150);

  // Una segunda conciliación con otro objetivo debe dejar el saldo exacto, no "objetivo - ajuste anterior".
  await db.query("select finance_private.reconcile_balances($1, $2)", [A, JSON.stringify([{ ...cash, balance: 180 }])]);
  const after = await rpc(db, A, "get_finance_state");
  assert.equal(Number(after.state.accounts[0].balance), 180);

  const again = await rpc(db, A, "import_local_finance_state", { p_state: local, p_migration_id: "m1", p_fingerprint: "f1" });
  assert.equal(again.alreadyImported, true);
});

// Cliente con la misma forma que supabase-js, pero ejecutando las RPC en PGlite.
function pgliteClient(db, userId) {
  return {
    rpc: async (name, args) => {
      try {
        return { data: await rpc(db, userId, name, args), error: null };
      } catch (error) {
        return { data: null, error: { code: error.code, message: error.message } };
      }
    },
  };
}

test("dos dispositivos: el reducer real guarda diffs y un conflicto se resuelve recargando y reaplicando", async () => {
  const { createSupabaseFinanceRepository } = await import("../src/repositories/supabaseFinanceRepository.js");
  const { applyWithRebase } = await import("../src/repositories/applyWithRebase.js");
  const { financeReducer } = await import("../src/context/financeReducer.js");
  const db = await freshDb();

  const phone = createSupabaseFinanceRepository(pgliteClient(db, A), A);
  const laptop = createSupabaseFinanceRepository(pgliteClient(db, A), A);
  async function act(repository, state, action) {
    const nextState = financeReducer(state, action);
    const { saved } = await applyWithRebase({ repository, reducer: financeReducer, action, previousState: state, nextState });
    return saved;
  }

  let phoneState = await phone.load();
  phoneState = await act(phone, phoneState, { type: "CREATE_ACCOUNT", payload: { id: "cash", name: "Caja", type: "efectivo", balance: 100 } });
  phoneState = await act(phone, phoneState, { type: "ADD_TRANSACTION", payload: { type: "gasto", amount: 20, accountId: "cash", date: "2026-11-20", description: "Almuerzo", category: "alimentacion" } });
  assert.equal(phoneState.accounts[0].balance, 80);

  // La laptop cargó antes del siguiente gasto del teléfono: su revisión queda vieja.
  let laptopState = await laptop.load();
  phoneState = await act(phone, phoneState, { type: "ADD_TRANSACTION", payload: { type: "gasto", amount: 5, accountId: "cash", date: "2026-11-20", description: "Café", category: "alimentacion" } });
  laptopState = await act(laptop, laptopState, { type: "ADD_TRANSACTION", payload: { type: "ingreso", amount: 50, accountId: "cash", date: "2026-11-20", description: "Venta", category: "otros" } });

  // La laptop recargó, reaplicó su ingreso y no pisó el café del teléfono.
  assert.equal(laptopState.accounts[0].balance, 125);
  const { state } = await rpc(db, A, "get_finance_state");
  assert.deepEqual(state.transactions.map((transaction) => transaction.description).sort(), ["Almuerzo", "Café", "Saldo inicial — Caja", "Venta"]);
  assert.equal(Number(state.accounts[0].balance), 125);

  // Editar el monto de un gasto cargado desde el servidor actualiza el saldo (sin balanceDelta heredado).
  const lunch = laptopState.transactions.find((transaction) => transaction.description === "Almuerzo");
  laptopState = await act(laptop, laptopState, { type: "UPDATE_TRANSACTION", payload: { id: lunch.id, amount: 30 } });
  assert.equal(laptopState.accounts[0].balance, 115);
});

test("presupuestos: partidas, gastos enlazados, edición y aislamiento entre usuarios", async () => {
  const db = await freshDb();
  await seed(db);
  const trip = { id: "b-trip", name: "Viaje a Cochabamba", startDate: "2026-12-10", endDate: "2026-12-14", status: "active",
    items: [{ id: "i-pasajes", name: "Pasajes", planned: 400 }, { id: "i-hotel", name: "Hotel", planned: 900 }, { id: "i-comida", name: "Comida", planned: 500 }] };
  const bus = { id: "t-bus", type: "gasto", amount: 380, accountId: "cash", date: "2026-12-01", description: "Bus", category: "transporte", budgetId: "b-trip", budgetItemId: "i-pasajes" };
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { budgets: [trip], transactions: [bus] } }, p_expected_revision: 1, p_operation_id: "budget-create" });

  let { state } = await rpc(db, A, "get_finance_state");
  assert.equal(state.budgets.length, 1);
  assert.deepEqual(state.budgets[0].items.map((item) => [item.name, Number(item.planned)]), [["Pasajes", 400], ["Hotel", 900], ["Comida", 500]]);
  const linked = state.transactions.find((transaction) => transaction.id === "t-bus");
  assert.equal(linked.budgetId, "b-trip");
  assert.equal(linked.budgetItemId, "i-pasajes");

  // Quitar una partida y reordenar: la quitada desaparece, el orden se respeta.
  const edited = { ...trip, items: [{ id: "i-comida", name: "Comida", planned: 650 }, { id: "i-pasajes", name: "Pasajes", planned: 400 }] };
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { budgets: [edited] } }, p_expected_revision: 2, p_operation_id: "budget-edit" });
  ({ state } = await rpc(db, A, "get_finance_state"));
  assert.deepEqual(state.budgets[0].items.map((item) => item.id), ["i-comida", "i-pasajes"]);

  // Otra persona no puede enlazar su gasto a un presupuesto ajeno.
  await rpc(db, B, "apply_finance_changes", { p_changes: { upsert: { accounts: [{ id: "b-cash", name: "Caja B", type: "efectivo" }] } }, p_expected_revision: 0, p_operation_id: "b-acc" });
  await rejects(rpc(db, B, "apply_finance_changes", {
    p_changes: { upsert: { transactions: [{ id: "t-steal", type: "gasto", amount: 1, accountId: "b-cash", date: "2026-12-01", budgetId: "b-trip" }] } },
    p_expected_revision: 1, p_operation_id: "b-cross" }), "23503");
  const others = await rpc(db, B, "get_finance_state");
  assert.deepEqual(others.state.budgets, []);
  await rejects(asUser(db, A, (tx) => tx.query("insert into public.budgets(user_id,id,name,currency) values ($1,'x','X','BOB')", [A])), "42501");

  // Eliminar el presupuesto (el cliente desenlaza antes sus gastos).
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { transactions: [{ ...bus, budgetId: null, budgetItemId: null }] }, remove: { budgets: ["b-trip"] } }, p_expected_revision: 3, p_operation_id: "budget-remove" });
  ({ state } = await rpc(db, A, "get_finance_state"));
  assert.deepEqual(state.budgets, []);
  assert.equal(state.transactions.find((transaction) => transaction.id === "t-bus").budgetId, null);
});


async function claim(db, when) {
  const { rows } = await asService(db, (tx) => tx.query("select * from public.claim_due_push_reminders($1::timestamptz)", [when]));
  return rows;
}

test("notificaciones: suscripción por dispositivo, recordatorios del día sin repetir y preferencias", async () => {
  const db = await freshDb();
  await seed(db);
  const endpoint = `https://push.example.test/${A}`;
  // Ingreso recurrente el día 5 y gasto fijo el 12.
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: {
    recurringIncomes: [{ id: "r-sueldo", name: "Sueldo", amount: 4000, dayOfMonth: 5, category: "salario", active: true }],
    recurringExpenses: [{ id: "r-alquiler", name: "Alquiler", amount: 1200, dayOfMonth: 12, category: "vivienda", active: true }],
  } }, p_expected_revision: 1, p_operation_id: "recurrentes" });

  // Sin dispositivo suscrito no se envía nada.
  assert.equal((await claim(db, "2026-12-05T13:00:00Z")).filter((row) => row.user_id === A).length, 0);

  await rejects(rpc(db, A, "save_push_subscription", { p_endpoint: "http://inseguro", p_p256dh: "k", p_auth: "a" }), "22023");
  const settings = await rpc(db, A, "save_push_subscription", { p_endpoint: endpoint, p_p256dh: "clave", p_auth: "secreto", p_user_agent: "test", p_timezone: "America/La_Paz" });
  assert.equal(settings.devices, 1);
  assert.equal(settings.payday, true);

  // La app (rol authenticated) no puede ejecutar la selección diaria.
  await rejects(asUser(db, A, (tx) => tx.query("select * from public.claim_due_push_reminders()")), "42501");

  // 5 de diciembre, 9:00 en La Paz: día de cobro.
  const payday = (await claim(db, "2026-12-05T13:00:00Z")).filter((row) => row.user_id === A);
  assert.deepEqual(payday.map((row) => [row.key, row.title, row.endpoint]), [["payday:r-sueldo:2026-12", "Hoy es día de cobro", endpoint]]);
  assert.match(payday[0].body, /Sueldo \(Bs 4\.000,00\)/);
  // Si el cron corre dos veces el mismo día, no se repite.
  assert.equal((await claim(db, "2026-12-05T18:00:00Z")).filter((row) => row.user_id === A).length, 0);

  // 11 de diciembre: mañana vence el alquiler.
  const due = (await claim(db, "2026-12-11T13:00:00Z")).filter((row) => row.user_id === A);
  assert.deepEqual(due.map((row) => row.key), ["due:r-alquiler:2026-12"]);

  // Con el sueldo de enero ya registrado no hay aviso de cobro en enero.
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { transactions: [{ id: "t-ene", type: "ingreso", amount: 4000, accountId: "cash", date: "2027-01-03", category: "salario", recurringId: "r-sueldo" }] } }, p_expected_revision: 2, p_operation_id: "sueldo-ene" });
  assert.ok(!(await claim(db, "2027-01-05T13:00:00Z")).some((row) => row.user_id === A && row.key.startsWith("payday")));

  // Preferencias: sin recordatorios de cobro no llega el de febrero.
  await rpc(db, A, "save_notification_settings", { p_settings: { payday: false, due: true, budgets: true, inactivity: true, month: true } });
  assert.ok(!(await claim(db, "2027-02-05T13:00:00Z")).some((row) => row.user_id === A && row.key.startsWith("payday")));

  // Si otra cuenta inicia sesión en el mismo navegador, el dispositivo pasa a esa cuenta.
  await rpc(db, B, "save_push_subscription", { p_endpoint: endpoint, p_p256dh: "clave", p_auth: "secreto" });
  assert.equal((await rpc(db, A, "get_notification_settings")).devices, 0);
  assert.equal((await rpc(db, B, "get_notification_settings")).devices, 1);
});

test("notificaciones: avisos de presupuesto y como máximo dos por día", async () => {
  const db = await freshDb();
  await seed(db);
  await rpc(db, A, "save_push_subscription", { p_endpoint: `https://push.example.test/b-${A}`, p_p256dh: "k", p_auth: "a" });
  const budget = { id: "b-viaje", name: "Viaje", startDate: "2026-12-10", endDate: "2026-12-20", status: "active",
    items: [{ id: "i-hotel", name: "Hotel", planned: 100 }, { id: "i-comida", name: "Comida", planned: 100 }, { id: "i-taxi", name: "Taxi", planned: 100 }] };
  const spend = (id, item, amount) => ({ id, type: "gasto", amount, accountId: "cash", date: "2026-12-11", budgetId: "b-viaje", budgetItemId: item });
  await rpc(db, A, "apply_finance_changes", { p_changes: { upsert: { budgets: [budget], transactions: [spend("x1", "i-hotel", 120), spend("x2", "i-comida", 85), spend("x3", "i-taxi", 90)] } }, p_expected_revision: 1, p_operation_id: "viaje" });

  const first = (await claim(db, "2026-12-12T13:00:00Z")).filter((row) => row.user_id === A);
  assert.deepEqual(first.map((row) => row.key), ["budget-over:i-hotel", "budget-warning:i-comida"]);
  assert.equal(first[0].title, "Te pasaste en Hotel");
  assert.equal(first[0].url, "/planes?tab=presupuestos");
  // Al día siguiente sale el que quedó pendiente.
  assert.deepEqual((await claim(db, "2026-12-13T13:00:00Z")).filter((row) => row.user_id === A).map((row) => row.key), ["budget-warning:i-taxi"]);
});
