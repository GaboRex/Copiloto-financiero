// Presupuestos por proyecto o evento. Funciones puras: no tocan React ni
// almacenamiento. Solo los gastos enlazados (budgetId) cuentan para un presupuesto.
import { localDateString } from "./format.js";

export const BUDGET_WARNING_RATIO = 0.8;

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function itemStatus(planned, spent) {
  if (planned <= 0) return spent > 0 ? "over" : "ok";
  if (spent > planned) return "over";
  if (spent >= planned * BUDGET_WARNING_RATIO) return "warning";
  return "ok";
}

// Normaliza un presupuesto recibido del formulario: nombre y partidas limpias.
export function sanitizeBudget(input, createId) {
  const items = (input.items || [])
    .map((item) => ({ id: item.id || createId("bitem"), name: String(item.name || "").trim(), planned: Math.max(0, money(item.planned)) }))
    .filter((item) => item.name);
  const startDate = input.startDate || null;
  let endDate = input.endDate || null;
  if (startDate && endDate && endDate < startDate) endDate = startDate;
  return {
    id: input.id || createId("budget"),
    name: String(input.name || "").trim(),
    startDate,
    endDate,
    status: input.status === "closed" ? "closed" : "active",
    note: String(input.note || "").trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    items,
  };
}

// Deja un enlace de presupuesto válido o lo quita (presupuesto o partida inexistente,
// o un movimiento que no es gasto).
export function sanitizeBudgetLink(transaction, budgets = []) {
  const budget = transaction.type === "gasto" ? budgets.find((item) => item.id === transaction.budgetId) : null;
  if (!budget) return { ...transaction, budgetId: null, budgetItemId: null };
  const itemExists = budget.items.some((item) => item.id === transaction.budgetItemId);
  return { ...transaction, budgetId: budget.id, budgetItemId: itemExists ? transaction.budgetItemId : null };
}

export function budgetPeriod(budget, today = localDateString()) {
  if (budget.status === "closed") return "closed";
  if (budget.startDate && today < budget.startDate) return "upcoming";
  if (budget.endDate && today > budget.endDate) return "finished";
  return "active";
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
}

export function summarizeBudget(budget, transactions = [], accounts = [], today = localDateString()) {
  const linked = transactions.filter((transaction) => transaction.budgetId === budget.id && transaction.type === "gasto");
  const itemIds = new Set(budget.items.map((item) => item.id));
  const spentByItem = new Map();
  let unassigned = 0;
  const byAccount = new Map();
  for (const transaction of linked) {
    const amount = money(transaction.amount);
    if (transaction.budgetItemId && itemIds.has(transaction.budgetItemId)) spentByItem.set(transaction.budgetItemId, money((spentByItem.get(transaction.budgetItemId) || 0) + amount));
    else unassigned = money(unassigned + amount);
    byAccount.set(transaction.accountId, money((byAccount.get(transaction.accountId) || 0) + amount));
  }

  const items = budget.items.map((item) => {
    const planned = money(item.planned);
    const spent = spentByItem.get(item.id) || 0;
    return { ...item, planned, spent, remaining: money(planned - spent), ratio: planned > 0 ? spent / planned : spent > 0 ? Infinity : 0, status: itemStatus(planned, spent) };
  });

  const planned = money(items.reduce((sum, item) => sum + item.planned, 0));
  const spent = money(items.reduce((sum, item) => sum + item.spent, 0) + unassigned);
  // Lo que aún falta gastar según el plan (las partidas excedidas no restan de las demás).
  const pending = money(items.reduce((sum, item) => sum + Math.max(0, item.remaining), 0));
  const period = budgetPeriod(budget, today);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  return {
    budget,
    period,
    items,
    planned,
    spent,
    unassigned,
    remaining: money(planned - spent),
    pending,
    ratio: planned > 0 ? spent / planned : 0,
    status: itemStatus(planned, spent),
    overItems: items.filter((item) => item.status === "over"),
    warningItems: items.filter((item) => item.status === "warning"),
    transactions: [...linked].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    byAccount: [...byAccount.entries()].map(([accountId, amount]) => ({ accountId, name: accountNames.get(accountId) || "Cuenta eliminada", amount })).sort((a, b) => b.amount - a.amount),
    daysLeft: budget.endDate && period !== "finished" && period !== "closed" ? Math.max(0, daysBetween(today, budget.endDate)) : null,
    daysToStart: budget.startDate && period === "upcoming" ? daysBetween(today, budget.startDate) : null,
  };
}

// ¿Alcanza el dinero disponible para lo que falta de los presupuestos activos?
export function budgetCoverage(summaries, availableMoney) {
  const pending = money(summaries.filter((summary) => summary.period === "active" || summary.period === "upcoming").reduce((sum, summary) => sum + summary.pending, 0));
  const available = money(availableMoney);
  return { pending, available, enough: available >= pending, shortfall: money(Math.max(0, pending - available)) };
}

export function summarizeBudgets(state, today = localDateString()) {
  const order = { active: 0, upcoming: 1, finished: 2, closed: 3 };
  return (state.budgets || [])
    .map((budget) => summarizeBudget(budget, state.transactions, state.accounts, today))
    .sort((a, b) => order[a.period] - order[b.period] || String(a.budget.startDate || "").localeCompare(String(b.budget.startDate || "")));
}
