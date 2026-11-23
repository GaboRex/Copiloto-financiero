import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, Pencil, Plus, ReceiptText, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useFinanceDispatch, useFinanceState } from "../context/FinanceContext.jsx";
import { TransactionItem } from "../components/finance/cards.jsx";
import { TransactionForm } from "../components/finance/TransactionForm.jsx";
import { SectionGuide } from "../components/SectionGuide.jsx";
import { Button, Card, Field, IconButton, Input, Modal, Select } from "../components/ui/primitives.jsx";
import { fmtBs, localDateString } from "../services/financial/format.js";
import { getTransactionBalanceDelta } from "../services/financial/ledger.js";

export default function Movimientos() {
  const state = useFinanceState();
  const dispatch = useFinanceDispatch();
  const [params, setParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(Boolean(params.get("nuevo")));
  const [movementType, setMovementType] = useState(params.get("nuevo") === "ingreso" ? "ingreso" : "gasto");
  const [editing, setEditing] = useState(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroCuenta, setFiltroCuenta] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState("reciente");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = Number(filtroCategoria !== "todas") + Number(filtroCuenta !== "todas") + Number(orden !== "reciente");
  // Al cerrar, quitamos ?nuevo= para que recargar la página no vuelva a abrir el formulario.
  function cerrarNuevo() { setModalOpen(false); if (params.get("nuevo")) setParams({}, { replace: true }); }

  function abrirNuevo(tipo) { setMovementType(tipo); setModalOpen(true); }
  const movimientosFiltrados = useMemo(() => {
    let list = [...state.transactions];
    if (filtroCategoria !== "todas") list = list.filter((transaction) => transaction.category === filtroCategoria);
    if (filtroCuenta !== "todas") list = list.filter((transaction) => transaction.accountId === filtroCuenta);
    if (busqueda.trim()) list = list.filter((transaction) => transaction.description.toLowerCase().includes(busqueda.toLowerCase()));
    return list.sort((a, b) => orden === "reciente" ? new Date(b.date) - new Date(a.date) : orden === "antiguo" ? new Date(a.date) - new Date(b.date) : orden === "mayor" ? b.amount - a.amount : a.amount - b.amount);
  }, [state.transactions, filtroCategoria, filtroCuenta, busqueda, orden]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3"><h1 className="font-display text-2xl font-semibold">Movimientos</h1><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setRecurringOpen(true)}><CalendarClock size={14} /> Recurrentes</Button><Button size="sm" variant="secondary" onClick={() => abrirNuevo("ingreso")}><Plus size={14} /> Ingreso</Button><Button size="sm" onClick={() => abrirNuevo("gasto")}><Plus size={14} /> Gasto</Button></div></div>
      <Card className="!p-4 sm:!p-5">
        <div className="flex gap-2 sm:hidden">
          <label className="relative flex-1">
            <span className="sr-only">Buscar movimientos</span>
            <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <Input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar descripción" className="w-full pl-9" />
          </label>
          <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="movement-filters" onClick={() => setFiltersOpen((open) => !open)}>
            <SlidersHorizontal size={16} aria-hidden="true" />Filtros{activeFilters ? <span className="ml-0.5 rounded-full bg-teal text-paper text-xs min-w-5 h-5 px-1.5 grid place-items-center">{activeFilters}</span> : null}
          </Button>
        </div>
        <div id="movement-filters" className={`${filtersOpen ? "grid" : "hidden"} sm:grid sm:grid-cols-4 gap-3 mt-3 sm:mt-0`}>
          <div className="hidden sm:block"><Field label="Buscar"><Input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Descripción..." /></Field></div>
          <Field label="Categoría"><Select value={filtroCategoria} onChange={(event) => setFiltroCategoria(event.target.value)}><option value="todas">Todas</option>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
          <Field label="Cuenta"><Select value={filtroCuenta} onChange={(event) => setFiltroCuenta(event.target.value)}><option value="todas">Todas</option>{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>
          <Field label="Ordenar por"><Select value={orden} onChange={(event) => setOrden(event.target.value)}><option value="reciente">Más reciente</option><option value="antiguo">Más antiguo</option><option value="mayor">Mayor monto</option><option value="menor">Menor monto</option></Select></Field>
        </div>
      </Card>
      {movimientosFiltrados.length === 0
        ? <EmptyMovements filtered={state.transactions.length > 0} onClear={() => { setBusqueda(""); setFiltroCategoria("todas"); setFiltroCuenta("todas"); }} onNew={() => abrirNuevo("gasto")} />
        : <Card className="!py-2">{(orden === "reciente" || orden === "antiguo" ? groupByDay(movimientosFiltrados) : [{ key: "all", items: movimientosFiltrados }]).map((group) => <section key={group.key} aria-label={group.label} className="stagger">
            {group.label ? <div className="sticky top-[52px] md:top-0 z-10 -mx-5 px-5 py-2 bg-paper/95 backdrop-blur flex items-center justify-between border-b border-line/70 first:mt-0 mt-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft first-letter:uppercase">{group.label}</h2><span className={`text-xs tabular-nums ${group.net >= 0 ? "text-teal" : "text-ink-soft"}`}>{group.net >= 0 ? "+" : "−"} {fmtBs(Math.abs(group.net), state.profile.currency)}</span></div> : null}
            {group.items.map((transaction) => <TransactionItem key={transaction.id} tx={transaction} categoryName={state.categories.find((category) => category.id === transaction.category)?.name || (transaction.type === "ajuste" ? "Ajuste de saldo" : transaction.category)} accountName={state.accounts.find((account) => account.id === transaction.accountId)?.name || "Cuenta eliminada"} currency={state.profile.currency} onEdit={!transaction.generated ? () => setEditing(transaction) : null} onDelete={!transaction.generated ? () => { if (window.confirm(`¿Eliminar “${transaction.description}”? El saldo de la cuenta se actualizará.`)) dispatch({ type: "DELETE_TRANSACTION", payload: transaction.id }); } : null} />)}
          </section>)}</Card>}
      <Modal open={modalOpen} onClose={cerrarNuevo} title={movementType === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto"}><TransactionForm key={movementType} initialType={movementType} onSuccess={cerrarNuevo} /></Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`Editar ${editing?.description || "movimiento"}`}><TransactionForm key={editing?.id} transaction={editing} onSuccess={() => setEditing(null)} /></Modal>
      <Modal open={recurringOpen} onClose={() => setRecurringOpen(false)} title="Ingresos y gastos recurrentes"><RecurringManager /></Modal>
      <SectionGuide section="movements" />
    </div>
  );
}

// Agrupa por día con etiqueta amigable y saldo neto del día.
function groupByDay(transactions) {
  const today = localDateString();
  const yesterday = localDateString(new Date(Date.now() - 86400000));
  const groups = [];
  for (const transaction of transactions) {
    const key = String(transaction.date).slice(0, 10);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const label = key === today ? "Hoy" : key === yesterday ? "Ayer" : new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T12:00:00`));
      group = { key, label, items: [], net: 0 };
      groups.push(group);
    }
    group.items.push(transaction);
    group.net += getTransactionBalanceDelta(transaction);
  }
  return groups;
}

function EmptyMovements({ filtered, onClear, onNew }) {
  return <Card className="text-center py-10">
    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-teal/10 text-teal animate-pop-in"><ReceiptText size={22} aria-hidden="true" /></span>
    <p className="font-display text-lg font-semibold mt-4">{filtered ? "Nada coincide con tu búsqueda" : "Aún no registras movimientos"}</p>
    <p className="text-sm text-ink-soft mt-1 max-w-xs mx-auto">{filtered ? "Prueba con otra palabra o quita los filtros." : "Registra tu primer gasto o ingreso para ver aquí tu historial."}</p>
    <div className="mt-5 flex justify-center">{filtered ? <Button variant="secondary" onClick={onClear}>Quitar filtros</Button> : <Button onClick={onNew}><Plus size={16} aria-hidden="true" />Registrar gasto</Button>}</div>
  </Card>;
}

function RecurringManager() {
  const state = useFinanceState();
  const dispatch = useFinanceDispatch();
  const [form, setForm] = useState({ kind: "gasto", name: "", amount: "", dayOfMonth: "1", category: "" });
  const [editingRecurring, setEditingRecurring] = useState(null);
  const items = [...(state.recurringIncomes || []).map((item) => ({ ...item, kind: "ingreso" })), ...(state.recurringExpenses || []).map((item) => ({ ...item, kind: "gasto" }))];
  const categories = state.categories.filter((category) => category.type === form.kind && !category.system);

  function save(event) {
    event.preventDefault();
    const recurringAmount = Number(form.amount);
    const day = Number(form.dayOfMonth);
    if (!form.name.trim() || !(recurringAmount > 0) || day < 1 || day > 31) return;
    dispatch({ type: editingRecurring ? "UPDATE_RECURRING_ITEM" : "ADD_RECURRING_ITEM", payload: { ...form, ...(editingRecurring ? { id: editingRecurring.id } : {}), name: form.name.trim(), amount: recurringAmount, dayOfMonth: day, category: form.category || categories[0]?.id, frequency: "mensual", active: true } });
    setForm({ kind: form.kind, name: "", amount: "", dayOfMonth: "1", category: "" });
    setEditingRecurring(null);
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">{items.length ? items.map((item) => <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 rounded bg-paper-raised p-3 text-sm"><div><strong>{item.name}</strong><div className="text-xs text-ink-soft">{item.kind === "ingreso" ? "Ingreso" : "Gasto"} · día {item.dayOfMonth || "sin fecha"} · {fmtBs(item.amount, state.profile.currency)}</div></div><div className="flex -mr-1"><IconButton label={`Editar recurrente ${item.name}`} onClick={() => { setEditingRecurring(item); setForm({ kind: item.kind, name: item.name, amount: String(item.amount), dayOfMonth: String(item.dayOfMonth || 1), category: item.category || "" }); }}><Pencil size={16} aria-hidden="true" /></IconButton><IconButton tone="danger" label={`Eliminar recurrente ${item.name}`} onClick={() => { if (window.confirm(`Eliminar el movimiento recurrente “${item.name}”?`)) dispatch({ type: "DELETE_RECURRING_ITEM", payload: { id: item.id, kind: item.kind } }); }}><Trash2 size={16} aria-hidden="true" /></IconButton></div></div>) : <p className="text-sm text-ink-soft">Todavía no tienes movimientos recurrentes.</p>}</div>
    <form onSubmit={save} className="border-t border-line pt-4 flex flex-col gap-3"><div className="grid grid-cols-2 gap-3"><Field label="Tipo"><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value, category: "" })}><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></Select></Field><Field label="Día del mes"><Input type="number" min="1" max="31" value={form.dayOfMonth} onChange={(event) => setForm({ ...form, dayOfMonth: event.target.value })} /></Field></div><Field label="Nombre"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Monto"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field><Field label="Categoría"><Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field></div><Button type="submit">{editingRecurring ? "Guardar recurrente" : "Añadir recurrente"}</Button>{editingRecurring ? <Button variant="ghost" onClick={() => { setEditingRecurring(null); setForm({ kind: "gasto", name: "", amount: "", dayOfMonth: "1", category: "" }); }}>Cancelar edición</Button> : null}</form>
  </div>;
}
