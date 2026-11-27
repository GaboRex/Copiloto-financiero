import test from "node:test";
import assert from "node:assert/strict";
import { budgetCoverage, budgetPeriod, sanitizeBudget, sanitizeBudgetLink, summarizeBudget, summarizeBudgets } from "../src/services/financial/budgets.js";
import { financeReducer } from "../src/context/financeReducer.js";
import { buildEmptyState } from "../src/data/mockData.js";
import { migrateState } from "../src/services/migrations.js";
import { buildFinanceChanges } from "../src/repositories/stateDiff.js";

let counter = 0;
const createId = (prefix) => `${prefix}-${++counter}`;

const trip = {
  id: "b1", name: "Viaje", startDate: "2026-12-10", endDate: "2026-12-14", status: "active",
  items: [{ id: "pasajes", name: "Pasajes", planned: 400 }, { id: "hotel", name: "Hotel", planned: 900 }, { id: "comida", name: "Comida", planned: 500 }],
};
const accounts = [{ id: "cash", name: "Efectivo" }, { id: "card", name: "Tarjeta" }];
const spend = (id, amount, budgetItemId, accountId = "cash", extra = {}) => ({ id, type: "gasto", amount, date: "2026-12-11", accountId, budgetId: "b1", budgetItemId, ...extra });

test("el resumen suma por partida, marca avisos y excesos, y separa lo gastado sin partida", () => {
  const transactions = [
    spend("t1", 380, "pasajes"),
    spend("t2", 120, "comida", "card"),
    spend("t3", 50, null),
    spend("t4", 999, "hotel", "cash", { type: "ingreso" }), // los ingresos no cuentan
    { id: "t5", type: "gasto", amount: 70, accountId: "cash", date: "2026-12-11" }, // gasto sin presupuesto
  ];
  const summary = summarizeBudget(trip, transactions, accounts, "2026-12-11");
  assert.deepEqual(summary.items.map((item) => [item.id, item.spent, item.remaining, item.status]), [
    ["pasajes", 380, 20, "warning"],
    ["hotel", 0, 900, "ok"],
    ["comida", 120, 380, "ok"],
  ]);
  assert.equal(summary.planned, 1800);
  assert.equal(summary.unassigned, 50);
  assert.equal(summary.spent, 550);
  assert.equal(summary.remaining, 1250);
  assert.equal(summary.pending, 1300);
  assert.deepEqual(summary.byAccount.map((row) => [row.name, row.amount]), [["Efectivo", 430], ["Tarjeta", 120]]);
  assert.equal(summary.period, "active");
  assert.equal(summary.daysLeft, 3);
});

test("una partida excedida no reduce lo pendiente de las demás", () => {
  const summary = summarizeBudget(trip, [spend("t1", 500, "pasajes")], accounts, "2026-12-11");
  assert.equal(summary.items[0].status, "over");
  assert.equal(summary.items[0].remaining, -100);
  assert.equal(summary.pending, 1400);
  assert.equal(summary.overItems.length, 1);
});

test("el periodo distingue próximo, activo, terminado y cerrado", () => {
  assert.equal(budgetPeriod(trip, "2026-12-01"), "upcoming");
  assert.equal(budgetPeriod(trip, "2026-12-14"), "active");
  assert.equal(budgetPeriod(trip, "2026-12-15"), "finished");
  assert.equal(budgetPeriod({ ...trip, status: "closed" }, "2026-12-11"), "closed");
  assert.equal(budgetPeriod({ ...trip, startDate: null, endDate: null }, "2030-01-01"), "active");
  assert.equal(summarizeBudget(trip, [], accounts, "2026-12-01").daysToStart, 9);
});

test("la cobertura compara lo pendiente de presupuestos vigentes con el dinero disponible", () => {
  const active = summarizeBudget(trip, [spend("t1", 380, "pasajes")], accounts, "2026-12-11");
  const closed = summarizeBudget({ ...trip, id: "b2", status: "closed" }, [], accounts, "2026-12-11");
  assert.deepEqual(budgetCoverage([active, closed], 1000), { pending: 1420, available: 1000, enough: false, shortfall: 420 });
  assert.equal(budgetCoverage([active], 5000).enough, true);
});

test("sanitizeBudget limpia partidas vacías, montos negativos y fechas invertidas", () => {
  const budget = sanitizeBudget({ name: "  Mudanza ", startDate: "2026-12-20", endDate: "2026-12-01", items: [{ name: "Camión", planned: "350.456" }, { name: "  ", planned: 10 }, { name: "Cajas", planned: -5 }] }, createId);
  assert.equal(budget.name, "Mudanza");
  assert.equal(budget.endDate, "2026-12-20");
  assert.deepEqual(budget.items.map((item) => [item.name, item.planned]), [["Camión", 350.46], ["Cajas", 0]]);
  assert.ok(budget.items.every((item) => item.id));
});

test("sanitizeBudgetLink quita enlaces a presupuestos o partidas inexistentes y de ingresos", () => {
  assert.deepEqual(sanitizeBudgetLink({ type: "gasto", budgetId: "nope", budgetItemId: "x" }, [trip]), { type: "gasto", budgetId: null, budgetItemId: null });
  assert.deepEqual(sanitizeBudgetLink({ type: "gasto", budgetId: "b1", budgetItemId: "borrada" }, [trip]), { type: "gasto", budgetId: "b1", budgetItemId: null });
  assert.deepEqual(sanitizeBudgetLink({ type: "ingreso", budgetId: "b1", budgetItemId: "hotel" }, [trip]), { type: "ingreso", budgetId: null, budgetItemId: null });
});

test("el reducer crea, edita y elimina presupuestos sin borrar los gastos enlazados", () => {
  let state = financeReducer(buildEmptyState(), { type: "CREATE_ACCOUNT", payload: { id: "cash", name: "Efectivo", type: "efectivo", balance: 2000 } });
  state = financeReducer(state, { type: "ADD_BUDGET", payload: { id: "b1", name: "Viaje", items: [{ id: "pasajes", name: "Pasajes", planned: 400 }, { id: "hotel", name: "Hotel", planned: 900 }] } });
  assert.equal(state.budgets.length, 1);

  state = financeReducer(state, { type: "ADD_TRANSACTION", payload: { type: "gasto", amount: 380, accountId: "cash", date: "2026-12-11", description: "Bus", category: "transporte", budgetId: "b1", budgetItemId: "pasajes" } });
  state = financeReducer(state, { type: "ADD_TRANSACTION", payload: { type: "gasto", amount: 50, accountId: "cash", date: "2026-12-11", description: "Inventado", category: "otros", budgetId: "no-existe", budgetItemId: "x" } });
  const [invalid, bus] = state.transactions;
  assert.equal(bus.budgetItemId, "pasajes");
  assert.equal(invalid.budgetId, null);

  // Quitar la partida "Pasajes": el gasto sigue en el presupuesto, sin partida.
  state = financeReducer(state, { type: "UPDATE_BUDGET", payload: { id: "b1", items: [{ id: "hotel", name: "Hotel", planned: 900 }] } });
  assert.equal(state.transactions.find((transaction) => transaction.id === bus.id).budgetItemId, null);
  assert.equal(state.transactions.find((transaction) => transaction.id === bus.id).budgetId, "b1");

  const beforeDelete = state;
  state = financeReducer(state, { type: "DELETE_BUDGET", payload: "b1" });
  assert.deepEqual(state.budgets, []);
  assert.equal(state.transactions.length, 3); // apertura de la cuenta + los dos gastos
  assert.equal(state.transactions.find((transaction) => transaction.id === bus.id).budgetId, null);

  // Lo que se envía al servidor: baja del presupuesto y el gasto desenlazado.
  const changes = buildFinanceChanges(beforeDelete, state);
  assert.deepEqual(changes.remove.budgets, ["b1"]);
  assert.equal(changes.upsert.transactions.length, 1);
});

test("datos antiguos sin presupuestos migran con lista vacía y el resumen general ordena por vigencia", () => {
  const migrated = migrateState({ accounts: [], transactions: [] });
  assert.deepEqual(migrated.budgets, []);
  const state = { ...migrated, budgets: [{ ...trip, id: "old", status: "closed" }, trip], accounts };
  assert.deepEqual(summarizeBudgets(state, "2026-12-11").map((summary) => summary.budget.id), ["b1", "old"]);
});
