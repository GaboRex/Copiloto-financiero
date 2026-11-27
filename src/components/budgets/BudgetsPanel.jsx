import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Lock, LockOpen, Pencil, Plus, Trash2, WalletCards } from "lucide-react";
import { useFinanceDispatch, useFinanceState } from "../../context/FinanceContext.jsx";
import { Badge, Button, Card, IconButton, Modal, ProgressBar } from "../ui/primitives.jsx";
import { TransactionItem } from "../finance/cards.jsx";
import { TransactionForm } from "../finance/TransactionForm.jsx";
import { BudgetForm } from "./BudgetForm.jsx";
import { budgetCoverage, summarizeBudgets } from "../../services/financial/budgets.js";
import { calculateAvailableMoney } from "../../services/financial/calculations.js";
import { fmtBs } from "../../services/financial/format.js";

const STATUS_COLOR = { ok: "#1F5C56", warning: "#C1892E", over: "#A63D2C" };
const PERIOD = {
  active: { label: "En curso", level: "positive" },
  upcoming: { label: "Próximo", level: "neutral" },
  finished: { label: "Terminado", level: "warning" },
  closed: { label: "Cerrado", level: "neutral" },
};

function formatRange(budget) {
  const format = (value) => new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
  if (budget.startDate && budget.endDate) return `${format(budget.startDate)} – ${format(budget.endDate)}`;
  if (budget.startDate) return `Desde ${format(budget.startDate)}`;
  if (budget.endDate) return `Hasta ${format(budget.endDate)}`;
  return "Sin fechas";
}

function periodHint(summary) {
  if (summary.period === "upcoming" && summary.daysToStart != null) return summary.daysToStart === 1 ? "empieza mañana" : `empieza en ${summary.daysToStart} días`;
  if (summary.period === "active" && summary.daysLeft != null) return summary.daysLeft === 0 ? "último día" : `quedan ${summary.daysLeft} días`;
  return null;
}

export function BudgetsPanel() {
  const state = useFinanceState();
  const dispatch = useFinanceDispatch();
  const currency = state.profile?.currency || "BOB";
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const summaries = useMemo(() => summarizeBudgets(state), [state]);
  const selected = summaries.find((summary) => summary.budget.id === selectedId);

  if (selected) return <BudgetDetail summary={selected} currency={currency} onBack={() => setSelectedId(null)} />;

  const coverage = budgetCoverage(summaries, calculateAvailableMoney(state).available);

  return <div className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">Presupuestos</h2>
        <p className="text-sm text-ink-soft">Para viajes, eventos o proyectos con su propio dinero.</p>
      </div>
      {summaries.length ? <Button size="sm" onClick={() => setFormOpen(true)}><Plus size={16} aria-hidden="true" />Nuevo</Button> : null}
    </div>

    {summaries.length === 0 ? <Card className="text-center py-10">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-teal/10 text-teal animate-pop-in"><WalletCards size={22} aria-hidden="true" /></span>
      <p className="font-display text-lg font-semibold mt-4">Crea tu primer presupuesto</p>
      <p className="text-sm text-ink-soft mt-1 max-w-xs mx-auto">Planifica cuánto gastar en cada partida y sigue lo real a medida que registras tus gastos.</p>
      <Button className="mt-5" onClick={() => setFormOpen(true)}><Plus size={16} aria-hidden="true" />Nuevo presupuesto</Button>
    </Card> : null}

    {coverage.pending > 0 ? <div role="status" className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${coverage.enough ? "border-teal/25 bg-teal/5" : "border-brick/30 bg-brick/5"}`}>
      {coverage.enough ? <CheckCircle2 size={18} className="text-teal shrink-0 mt-0.5" aria-hidden="true" /> : <AlertTriangle size={18} className="text-brick shrink-0 mt-0.5" aria-hidden="true" />}
      <p>
        Te faltan <strong className="tabular-nums">{fmtBs(coverage.pending, currency)}</strong> por gastar en tus presupuestos vigentes.{" "}
        {coverage.enough
          ? <>Tu dinero disponible (<span className="tabular-nums">{fmtBs(coverage.available, currency)}</span>) alcanza.</>
          : <>Con tu dinero disponible te faltarían <strong className="text-brick tabular-nums">{fmtBs(coverage.shortfall, currency)}</strong>.</>}
      </p>
    </div> : null}

    <div className="grid sm:grid-cols-2 gap-3 stagger">
      {summaries.map((summary) => <BudgetCard key={summary.budget.id} summary={summary} currency={currency} onOpen={() => setSelectedId(summary.budget.id)} />)}
    </div>

    <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Nuevo presupuesto">
      <BudgetForm currency={currency} onSubmit={(budget) => { dispatch({ type: "ADD_BUDGET", payload: budget }); setFormOpen(false); }} />
    </Modal>
  </div>;
}

function BudgetCard({ summary, currency, onOpen }) {
  const { budget } = summary;
  const period = PERIOD[summary.period];
  const hint = periodHint(summary);
  const alerts = summary.overItems.length || summary.warningItems.length;
  return <button type="button" onClick={onOpen}
    className={`group text-left rounded-lg border border-line bg-paper p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-card hover:border-line-strong/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${summary.period === "closed" ? "opacity-75" : ""}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-display font-semibold truncate">{budget.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft"><CalendarDays size={13} aria-hidden="true" />{formatRange(budget)}{hint ? <> · {hint}</> : null}</p>
      </div>
      <Badge level={period.level}>{period.label}</Badge>
    </div>
    <div className="mt-4 flex items-end justify-between gap-2">
      <p className="text-sm"><span className="font-display text-xl font-semibold tabular-nums">{fmtBs(summary.spent, currency)}</span> <span className="text-ink-soft">de {fmtBs(summary.planned, currency)}</span></p>
      <ChevronRight size={18} className="text-ink-soft mb-1 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </div>
    <ProgressBar value={Math.min(summary.spent, summary.planned)} max={summary.planned || 1} color={STATUS_COLOR[summary.status]} trackClassName="mt-2" />
    <p className={`mt-2 text-xs ${summary.remaining < 0 ? "text-brick font-medium" : "text-ink-soft"}`}>
      {summary.remaining < 0 ? `Excedido por ${fmtBs(-summary.remaining, currency)}` : `Quedan ${fmtBs(summary.remaining, currency)}`}
      {alerts ? <span className="ml-2 inline-flex items-center gap-1 text-[#8A5F1E]"><AlertTriangle size={12} aria-hidden="true" />{summary.overItems.length ? `${summary.overItems.length} excedida${summary.overItems.length > 1 ? "s" : ""}` : `${summary.warningItems.length} cerca del límite`}</span> : null}
    </p>
  </button>;
}

function BudgetDetail({ summary, currency, onBack }) {
  const state = useFinanceState();
  const dispatch = useFinanceDispatch();
  const [editing, setEditing] = useState(false);
  const [expenseFor, setExpenseFor] = useState(null); // { itemId } | null
  const { budget } = summary;
  const period = PERIOD[summary.period];
  const hint = periodHint(summary);
  const closed = budget.status === "closed";

  function remove() {
    if (!window.confirm(`¿Eliminar el presupuesto «${budget.name}»? Sus gastos no se borran: solo dejan de estar asignados.`)) return;
    dispatch({ type: "DELETE_BUDGET", payload: budget.id });
    onBack();
  }

  return <div className="flex flex-col gap-4 animate-fade-in-up">
    <button type="button" onClick={onBack} className="self-start inline-flex items-center gap-1.5 rounded text-sm text-ink-soft hover:text-ink min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
      <ArrowLeft size={16} aria-hidden="true" />Todos los presupuestos
    </button>

    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap"><h2 className="font-display text-2xl font-semibold">{budget.name}</h2><Badge level={period.level}>{period.label}</Badge></div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft"><CalendarDays size={14} aria-hidden="true" />{formatRange(budget)}{hint ? <> · {hint}</> : null}</p>
      </div>
      <div className="flex -mr-2 shrink-0">
        <IconButton label="Editar presupuesto" onClick={() => setEditing(true)}><Pencil size={17} aria-hidden="true" /></IconButton>
        <IconButton label={closed ? "Reabrir presupuesto" : "Cerrar presupuesto"} onClick={() => dispatch({ type: "UPDATE_BUDGET", payload: { id: budget.id, status: closed ? "active" : "closed" } })}>
          {closed ? <LockOpen size={17} aria-hidden="true" /> : <Lock size={17} aria-hidden="true" />}
        </IconButton>
        <IconButton tone="danger" label="Eliminar presupuesto" onClick={remove}><Trash2 size={17} aria-hidden="true" /></IconButton>
      </div>
    </div>

    {/* Resumen */}
    <section aria-label="Resumen del presupuesto" className="relative overflow-hidden rounded-xl bg-teal text-paper p-5 shadow-card">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full border border-paper/10" />
      <p className="relative text-sm text-paper/85">{summary.remaining < 0 ? "Excedido por" : "Te queda por gastar"}</p>
      <p className={`relative font-display text-4xl font-semibold tabular-nums mt-1 ${summary.remaining < 0 ? "text-[#F6C9BE]" : ""}`}>{fmtBs(Math.abs(summary.remaining), currency)}</p>
      <div className="relative mt-4 h-2 rounded-full bg-paper/20 overflow-hidden">
        <div className="h-full rounded-full bg-paper transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, summary.ratio * 100)}%` }} />
      </div>
      <p className="relative mt-2 text-sm text-paper/85 tabular-nums">Gastado {fmtBs(summary.spent, currency)} de {fmtBs(summary.planned, currency)} · {Math.round(summary.ratio * 100)}%</p>
      {!closed ? <Button className="relative mt-4 !bg-paper !text-ink hover:!bg-paper-raised" onClick={() => setExpenseFor({ itemId: null })}><Plus size={16} aria-hidden="true" />Registrar gasto</Button> : null}
    </section>

    {/* Partidas */}
    <Card title="Partidas">
      <ul className="flex flex-col divide-y divide-line/70 stagger">
        {summary.items.map((item) => <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-sm min-w-0 truncate">{item.name}</p>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm tabular-nums"><strong>{fmtBs(item.spent, currency)}</strong> <span className="text-ink-soft">/ {fmtBs(item.planned, currency)}</span></span>
              {!closed ? <IconButton label={`Registrar gasto en ${item.name}`} className="-mr-2" onClick={() => setExpenseFor({ itemId: item.id })}><Plus size={16} aria-hidden="true" /></IconButton> : null}
            </div>
          </div>
          <ProgressBar value={Math.min(item.spent, item.planned)} max={item.planned || 1} color={STATUS_COLOR[item.status]} trackClassName="mt-1.5" label={`${item.name}: ${Math.round(Math.min(item.ratio, 9.99) * 100)}% usado`} />
          <p className={`mt-1 text-xs ${item.status === "over" ? "text-brick font-medium" : item.status === "warning" ? "text-[#8A5F1E]" : "text-ink-soft"}`}>
            {item.status === "over" ? `Excedida por ${fmtBs(-item.remaining, currency)}` : item.status === "warning" ? `Cerca del límite · quedan ${fmtBs(item.remaining, currency)}` : `Quedan ${fmtBs(item.remaining, currency)}`}
          </p>
        </li>)}
        {summary.unassigned > 0 ? <li className="py-3 last:pb-0 flex items-center justify-between text-sm">
          <span className="text-ink-soft">Sin partida</span><strong className="tabular-nums">{fmtBs(summary.unassigned, currency)}</strong>
        </li> : null}
      </ul>
    </Card>

    {summary.byAccount.length ? <Card title="Pagado con">
      <ul className="flex flex-col gap-2 text-sm">
        {summary.byAccount.map((row) => <li key={row.accountId} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><WalletCards size={15} className="text-teal" aria-hidden="true" />{row.name}</span>
          <span className="tabular-nums font-medium">{fmtBs(row.amount, currency)}</span>
        </li>)}
      </ul>
    </Card> : null}

    <Card title="Gastos del presupuesto">
      {summary.transactions.length === 0
        ? <p className="text-sm text-ink-soft">Todavía no hay gastos asignados. Usa «Registrar gasto» o elige este presupuesto al registrar un gasto en Movimientos.</p>
        : summary.transactions.map((transaction) => <TransactionItem key={transaction.id} tx={transaction}
            categoryName={budget.items.find((item) => item.id === transaction.budgetItemId)?.name || "Sin partida"}
            accountName={state.accounts.find((account) => account.id === transaction.accountId)?.name || "Cuenta eliminada"}
            currency={currency} />)}
    </Card>

    <Modal open={editing} onClose={() => setEditing(false)} title={`Editar ${budget.name}`}>
      <BudgetForm budget={budget} currency={currency} onSubmit={(changes) => { dispatch({ type: "UPDATE_BUDGET", payload: { id: budget.id, ...changes } }); setEditing(false); }} />
    </Modal>
    <Modal open={Boolean(expenseFor)} onClose={() => setExpenseFor(null)} title={`Gasto en ${budget.name}`}>
      {expenseFor ? <TransactionForm initialType="gasto" lockType initialBudgetId={budget.id} initialBudgetItemId={expenseFor.itemId} onSuccess={() => setExpenseFor(null)} /> : null}
    </Modal>
  </div>;
}

// Resumen compacto para Inicio: presupuestos en curso o próximos.
export function BudgetsOverview({ onOpen }) {
  const state = useFinanceState();
  const currency = state.profile?.currency || "BOB";
  const current = summarizeBudgets(state).filter((summary) => summary.period === "active" || summary.period === "upcoming").slice(0, 3);
  if (current.length === 0) return null;
  return <Card title="Presupuestos" action={<button type="button" onClick={onOpen} className="inline-flex items-center gap-0.5 rounded px-2 -mr-2 min-h-[36px] text-sm text-ochre-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">Ver todos<ChevronRight size={15} aria-hidden="true" /></button>}>
    <ul className="flex flex-col gap-4">
      {current.map((summary) => <li key={summary.budget.id}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium truncate">{summary.budget.name}</span>
          <span className="tabular-nums text-ink-soft shrink-0">{fmtBs(summary.spent, currency)} / {fmtBs(summary.planned, currency)}</span>
        </div>
        <ProgressBar value={Math.min(summary.spent, summary.planned)} max={summary.planned || 1} color={STATUS_COLOR[summary.status]} trackClassName="mt-1.5" />
      </li>)}
    </ul>
  </Card>;
}

