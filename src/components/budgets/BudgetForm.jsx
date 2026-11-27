import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, IconButton, Input } from "../ui/primitives.jsx";
import { fmtBs } from "../../services/financial/format.js";

// Plantillas para no empezar de cero: solo sugieren nombres de partidas.
const TEMPLATES = [
  { name: "Viaje", items: ["Pasajes", "Alojamiento", "Comida", "Actividades"] },
  { name: "Mudanza", items: ["Transporte", "Cajas y embalaje", "Depósito", "Limpieza"] },
  { name: "Cumpleaños", items: ["Comida", "Bebidas", "Decoración", "Regalo"] },
  { name: "Regreso a clases", items: ["Útiles", "Uniformes", "Matrícula"] },
];

let draftCounter = 0;
const draftId = () => `draft-${Date.now()}-${++draftCounter}`;
const emptyItem = () => ({ id: draftId(), name: "", planned: "", isNew: true });

function initialForm(budget) {
  if (!budget) return { name: "", startDate: "", endDate: "", note: "", items: [emptyItem(), emptyItem()] };
  return {
    name: budget.name,
    startDate: budget.startDate || "",
    endDate: budget.endDate || "",
    note: budget.note || "",
    items: budget.items.map((item) => ({ id: item.id, name: item.name, planned: String(item.planned) })),
  };
}

export function BudgetForm({ budget = null, currency = "BOB", onSubmit }) {
  const [form, setForm] = useState(() => initialForm(budget));
  const [error, setError] = useState("");
  const editing = Boolean(budget);
  const total = form.items.reduce((sum, item) => sum + (Number(item.planned) || 0), 0);

  function updateItem(id, changes) {
    setForm((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) }));
  }

  function applyTemplate(template) {
    setForm((current) => ({ ...current, name: current.name || template.name, items: template.items.map((name) => ({ ...emptyItem(), name })) }));
  }

  function submit(event) {
    event.preventDefault();
    const items = form.items
      .filter((item) => item.name.trim())
      // Las partidas nuevas no llevan id: lo asigna el reducer.
      .map((item) => ({ ...(item.isNew ? {} : { id: item.id }), name: item.name.trim(), planned: Number(item.planned) || 0 }));
    if (!form.name.trim()) { setError("Ponle un nombre al presupuesto."); return; }
    if (items.length === 0) { setError("Agrega al menos una partida con nombre."); return; }
    if (form.startDate && form.endDate && form.endDate < form.startDate) { setError("La fecha de fin no puede ser anterior a la de inicio."); return; }
    onSubmit({ name: form.name.trim(), startDate: form.startDate || null, endDate: form.endDate || null, note: form.note.trim(), items });
  }

  return <form onSubmit={submit} className="flex flex-col gap-4">
    {!editing ? <div>
      <p className="text-xs text-ink-soft mb-2">Empieza con una plantilla</p>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((template) => <button key={template.name} type="button" onClick={() => applyTemplate(template)}
          className="rounded-full border border-line px-3.5 min-h-[36px] text-sm hover:bg-paper-raised hover:border-line-strong/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          {template.name}
        </button>)}
      </div>
    </div> : null}

    <Field label="Nombre"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Viaje a Cochabamba" required /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Desde (opcional)"><Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
      <Field label="Hasta (opcional)"><Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></Field>
    </div>

    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs text-ink-soft mb-1">Partidas</legend>
      {form.items.map((item, index) => <div key={item.id} className="grid grid-cols-[1fr_7.5rem_auto] gap-2 items-center animate-fade-in">
        <Input aria-label={`Nombre de la partida ${index + 1}`} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} placeholder="Ej. Hotel" />
        <Input aria-label={`Monto planificado de la partida ${index + 1}`} type="number" min="0" step="0.01" value={item.planned} onChange={(event) => updateItem(item.id, { planned: event.target.value })} placeholder="0" />
        <IconButton tone="danger" label={`Quitar partida ${item.name || index + 1}`} disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((row) => row.id !== item.id) }))}>
          <Trash2 size={16} aria-hidden="true" />
        </IconButton>
      </div>)}
      <button type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))}
        className="self-start inline-flex items-center gap-1.5 rounded px-2 min-h-[40px] text-sm text-teal font-medium hover:bg-teal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
        <Plus size={16} aria-hidden="true" />Agregar partida
      </button>
    </fieldset>

    <div className="flex items-center justify-between rounded-lg bg-paper-raised px-4 py-3">
      <span className="text-sm text-ink-soft">Total planificado</span>
      <span className="font-display text-lg font-semibold tabular-nums">{fmtBs(total, currency)}</span>
    </div>

    {editing ? <p className="text-xs text-ink-soft">Si quitas una partida, sus gastos siguen dentro del presupuesto como «Sin partida».</p> : null}
    {error ? <p role="alert" className="rounded-lg bg-brick/10 p-3 text-sm text-brick">{error}</p> : null}
    <Button type="submit">{editing ? "Guardar cambios" : "Crear presupuesto"}</Button>
  </form>;
}
