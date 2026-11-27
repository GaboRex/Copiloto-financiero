import test from "node:test";
import assert from "node:assert/strict";
import { getReminders } from "../src/services/financial/reminders.js";
import { readDismissed, dismiss } from "../src/pwa/pwa.js";

const base = () => ({
  accounts: [{ id: "cash", name: "Efectivo", type: "efectivo", balance: 1000 }],
  transactions: [],
  recurringIncomes: [{ id: "sueldo", name: "Sueldo", category: "salario", amount: 4000, dayOfMonth: 5, active: true }],
  recurringExpenses: [{ id: "alquiler", name: "Alquiler", category: "vivienda", amount: 1200, dayOfMonth: 12, active: true }],
  budgets: [],
});
const kinds = (state, date) => getReminders(state, new Date(date)).map((reminder) => reminder.key);

test("el día de cobro aparece desde la fecha hasta 3 días después y se va al registrarlo", () => {
  const state = base();
  assert.ok(!kinds(state, "2026-12-04T10:00:00").some((key) => key.startsWith("payday")));
  const onDay = getReminders(state, new Date("2026-12-05T10:00:00"));
  assert.equal(onDay[0].key, "payday:sueldo:2026-12");
  assert.equal(onDay[0].title, "Hoy es día de cobro");
  assert.deepEqual(onDay[0].action.payload, { type: "ingreso", description: "Sueldo", amount: 4000, category: "salario", accountId: null, recurringId: "sueldo" });
  assert.equal(getReminders(state, new Date("2026-12-08T10:00:00"))[0].title, "¿Ya cobraste Sueldo?");
  assert.ok(!kinds(state, "2026-12-09T10:00:00").some((key) => key.startsWith("payday")));

  // Registrado con enlace, o a mano con la misma categoría y monto: ya no se recuerda.
  const linked = { ...state, transactions: [{ id: "t", type: "ingreso", amount: 4000, date: "2026-12-05", recurringId: "sueldo", origin: "user" }] };
  assert.ok(!kinds(linked, "2026-12-06T10:00:00").some((key) => key.startsWith("payday")));
  const manual = { ...state, transactions: [{ id: "t", type: "ingreso", amount: 4000, date: "2026-12-05", category: "salario", description: "Pago diciembre", origin: "user" }] };
  assert.ok(!kinds(manual, "2026-12-06T10:00:00").some((key) => key.startsWith("payday")));
  // Lo cobrado el mes anterior no cuenta.
  const lastMonth = { ...state, transactions: [{ id: "t", type: "ingreso", amount: 4000, date: "2026-11-05", recurringId: "sueldo", origin: "user" }] };
  assert.ok(kinds(lastMonth, "2026-12-05T10:00:00").includes("payday:sueldo:2026-12"));
});

test("un cobro el día 31 se recuerda el último día de meses más cortos", () => {
  const state = { ...base(), recurringIncomes: [{ id: "s", name: "Sueldo", amount: 100, dayOfMonth: 31, active: true }] };
  assert.ok(kinds(state, "2027-02-28T10:00:00").includes("payday:s:2027-02"));
});

test("los gastos fijos se recuerdan el día anterior y el mismo día, salvo que ya estén pagados", () => {
  const state = base();
  const tomorrow = getReminders(state, new Date("2026-12-11T10:00:00")).find((reminder) => reminder.kind === "due");
  assert.equal(tomorrow.title, "Mañana vence Alquiler");
  assert.equal(getReminders(state, new Date("2026-12-12T10:00:00")).find((reminder) => reminder.kind === "due").title, "Hoy vence Alquiler");
  const paid = { ...state, transactions: [{ id: "t", type: "gasto", amount: 1200, date: "2026-12-10", description: "alquiler", origin: "user" }] };
  assert.ok(!kinds(paid, "2026-12-12T10:00:00").some((key) => key.startsWith("due")));
});

test("presupuestos: avisa la peor partida y el día antes de empezar", () => {
  const budget = { id: "b", name: "Viaje", startDate: "2026-12-10", endDate: "2026-12-14", status: "active", items: [{ id: "i1", name: "Comida", planned: 100 }, { id: "i2", name: "Hotel", planned: 100 }] };
  const state = { ...base(), budgets: [budget], transactions: [
    { id: "a", type: "gasto", amount: 85, date: "2026-12-10", budgetId: "b", budgetItemId: "i1", accountId: "cash" },
    { id: "c", type: "gasto", amount: 130, date: "2026-12-10", budgetId: "b", budgetItemId: "i2", accountId: "cash" },
  ] };
  const during = getReminders(state, new Date("2026-12-11T10:00:00")).filter((reminder) => reminder.kind === "budget");
  assert.deepEqual(during.map((reminder) => reminder.title), ["Te pasaste en Hotel"]);
  assert.ok(kinds({ ...state, transactions: [] }, "2026-12-09T10:00:00").includes("budget-start:b"));
});

test("inactividad tras 5 días sin movimientos reales, y cierre e inicio de mes", () => {
  const state = { ...base(), recurringIncomes: [], recurringExpenses: [], transactions: [{ id: "t", type: "gasto", amount: 10, date: "2026-12-14", origin: "user", generated: false }] };
  assert.ok(!kinds(state, "2026-12-18T10:00:00").some((key) => key.startsWith("inactive")));
  assert.ok(kinds(state, "2026-12-19T10:00:00").includes("inactive:2026-12-14"));
  assert.ok(kinds(state, "2026-12-30T10:00:00").includes("monthend:2026-12"));
  assert.ok(kinds(state, "2027-01-02T10:00:00").includes("monthstart:2027-01"));
  assert.deepEqual(getReminders({ ...state, accounts: [] }, new Date("2026-12-30T10:00:00")), []);
});

test("los avisos descartados se guardan por dispositivo y se limitan a 200", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  dismiss("payday:sueldo:2026-12", storage);
  assert.ok(readDismissed(storage)["payday:sueldo:2026-12"]);
  for (let index = 0; index < 250; index += 1) dismiss(`k${index}`, storage);
  assert.equal(Object.keys(readDismissed(storage)).length, 200);
});
