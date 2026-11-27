// Recordatorios dentro de la app. Función pura: a partir del estado y la fecha
// decide qué conviene recordar hoy. Cada recordatorio tiene una clave estable
// por periodo (p. ej. "payday:rec-1:2026-12") para poder descartarlo sin que
// vuelva a aparecer en ese mismo periodo.
import { localDateString, parseDate } from "./format.js";
import { isRealUserTransaction } from "./ledger.js";
import { summarizeBudgets } from "./budgets.js";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const PAYDAY_WINDOW_DAYS = 3; // el recordatorio de cobro sigue visible 3 días después de la fecha
export const INACTIVITY_DAYS = 5;

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
const clampDay = (day, date) => Math.min(Math.max(1, Number(day) || 1), daysInMonth(date));
const sameMonth = (value, date) => String(value || "").slice(0, 7) === monthKey(date);
const normalize = (text) => String(text || "").trim().toLowerCase();

// ¿Ya se registró este recurrente en el mes? Por enlace (recurringId) o, si se
// registró a mano, por descripción igual o misma categoría y monto.
function alreadyRegistered(item, type, transactions, date) {
  return transactions.some((transaction) => transaction.type === type && sameMonth(transaction.date, date) && (
    transaction.recurringId === item.id
    || normalize(transaction.description) === normalize(item.name)
    || (transaction.category === item.category && Math.abs(Number(transaction.amount) - Number(item.amount)) < 0.01)
  ));
}

export function getReminders(state, referenceDate = new Date()) {
  const today = parseDate(referenceDate);
  const todayIso = localDateString(today);
  const day = today.getDate();
  const transactions = state.transactions || [];
  if (!(state.accounts || []).length) return [];
  const reminders = [];

  // 1. Día de cobro de ingresos recurrentes.
  for (const income of (state.recurringIncomes || []).filter((item) => item.active !== false && Number(item.amount) > 0)) {
    const payDay = clampDay(income.dayOfMonth, today);
    if (day < payDay || day > payDay + PAYDAY_WINDOW_DAYS) continue;
    if (alreadyRegistered(income, "ingreso", transactions, today)) continue;
    reminders.push({
      key: `payday:${income.id}:${monthKey(today)}`, kind: "payday", priority: 1,
      title: day === payDay ? "Hoy es día de cobro" : `¿Ya cobraste ${income.name}?`,
      body: `Registra ${income.name} por el monto de siempre con un toque.`,
      amount: Number(income.amount),
      action: { type: "register", label: `Registrar ${income.name}`, payload: { type: "ingreso", description: income.name, amount: Number(income.amount), category: income.category, accountId: income.accountId || null, recurringId: income.id } },
    });
  }

  // 2. Gastos fijos que vencen hoy o mañana y aún no se pagaron.
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), day + 1);
  for (const expense of (state.recurringExpenses || []).filter((item) => item.active !== false && Number(item.amount) > 0)) {
    const dueToday = clampDay(expense.dayOfMonth, today) === day;
    const dueTomorrow = tomorrow.getMonth() === today.getMonth() && clampDay(expense.dayOfMonth, today) === tomorrow.getDate();
    if (!dueToday && !dueTomorrow) continue;
    if (alreadyRegistered(expense, "gasto", transactions, today)) continue;
    reminders.push({
      key: `due:${expense.id}:${monthKey(today)}`, kind: "due", priority: 2,
      title: `${dueToday ? "Hoy" : "Mañana"} vence ${expense.name}`,
      body: "Cuando lo pagues, regístralo para mantener tus saldos al día.",
      amount: Number(expense.amount),
      action: { type: "register", label: "Registrar pago", payload: { type: "gasto", description: expense.name, amount: Number(expense.amount), category: expense.category, accountId: expense.accountId || null, recurringId: expense.id } },
    });
  }

  // 3. Presupuestos: el peor estado de cada presupuesto vigente y los que empiezan mañana.
  for (const summary of summarizeBudgets(state, todayIso)) {
    if (summary.period === "active") {
      const over = summary.overItems[0];
      const warning = summary.warningItems[0];
      const item = over || warning;
      if (item) reminders.push({
        key: `budget-${over ? "over" : "warning"}:${item.id}`, kind: "budget", priority: over ? 3 : 4,
        title: over ? `Te pasaste en ${item.name}` : `${item.name} está cerca del límite`,
        body: `${summary.budget.name}: ${over ? "esta partida ya superó lo planificado" : `ya usaste el ${Math.round(item.ratio * 100)}%`}.`,
        action: { type: "navigate", label: "Ver presupuesto", to: "/planes?tab=presupuestos" },
      });
    }
    if (summary.period === "upcoming" && summary.daysToStart === 1) reminders.push({
      key: `budget-start:${summary.budget.id}`, kind: "budget", priority: 5,
      title: `Mañana empieza ${summary.budget.name}`,
      body: "Revisa tus partidas y registra cada gasto en su lugar.",
      action: { type: "navigate", label: "Ver presupuesto", to: "/planes?tab=presupuestos" },
    });
  }

  // 4. Inactividad: varios días sin registrar movimientos reales.
  const real = transactions.filter(isRealUserTransaction);
  if (real.length) {
    const last = real.reduce((latest, transaction) => (String(transaction.date) > latest ? String(transaction.date).slice(0, 10) : latest), "");
    const idle = Math.floor((parseDate(todayIso) - parseDate(last)) / 86400000);
    if (idle >= INACTIVITY_DAYS) reminders.push({
      key: `inactive:${last}`, kind: "inactive", priority: 6,
      title: "¿Todo en orden?",
      body: `Llevas ${idle} días sin registrar movimientos. Anotar tus gastos mantiene tus números al día.`,
      action: { type: "register", label: "Registrar gasto", payload: { type: "gasto" } },
    });
  }

  // 5. Cierre e inicio de mes.
  const left = daysInMonth(today) - day;
  if (left <= 1) reminders.push({
    key: `monthend:${monthKey(today)}`, kind: "month", priority: 7,
    title: `Se termina ${MONTHS[today.getMonth()]}`,
    body: "Revisa cómo te fue este mes antes de que cierre.",
    action: { type: "navigate", label: "Ver análisis", to: "/analisis" },
  });
  if (day <= 3) {
    const previous = MONTHS[(today.getMonth() + 11) % 12];
    reminders.push({
      key: `monthstart:${monthKey(today)}`, kind: "month", priority: 7,
      title: `Empieza ${MONTHS[today.getMonth()]}`,
      body: `Mira el resumen de ${previous} y planifica el nuevo mes.`,
      action: { type: "navigate", label: "Ver análisis", to: "/analisis" },
    });
  }

  return reminders.sort((a, b) => a.priority - b.priority);
}
