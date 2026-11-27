import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CalendarDays, PenLine, Wallet, X } from "lucide-react";
import { useFinanceState } from "../../context/FinanceContext.jsx";
import { Button, IconButton, Modal } from "../ui/primitives.jsx";
import { TransactionForm } from "../finance/TransactionForm.jsx";
import { getReminders } from "../../services/financial/reminders.js";
import { fmtBs } from "../../services/financial/format.js";
import { useDismissed } from "../../pwa/pwa.js";

const LOOK = {
  payday: { icon: Wallet, tone: "bg-teal/10 text-teal", border: "border-teal/30" },
  due: { icon: CalendarClock, tone: "bg-ochre/15 text-[#8A5F1E]", border: "border-ochre/40" },
  budget: { icon: AlertTriangle, tone: "bg-ochre/15 text-[#8A5F1E]", border: "border-ochre/40" },
  inactive: { icon: PenLine, tone: "bg-paper-raised text-ink-soft", border: "border-line" },
  month: { icon: CalendarDays, tone: "bg-paper-raised text-ink-soft", border: "border-line" },
};

// Recordatorios de hoy en Inicio: como máximo 3, cada uno descartable.
export function RemindersStack({ max = 3 }) {
  const state = useFinanceState();
  const navigate = useNavigate();
  const { isDismissed, dismiss } = useDismissed();
  const [registering, setRegistering] = useState(null);
  const reminders = useMemo(() => getReminders(state), [state]);
  const visible = reminders.filter((reminder) => !isDismissed(reminder.key)).slice(0, max);
  const currency = state.profile?.currency || "BOB";

  if (!visible.length && !registering) return null;

  function act(reminder) {
    if (reminder.action.type === "navigate") navigate(reminder.action.to);
    else setRegistering(reminder);
  }

  return <section aria-label="Recordatorios" className="flex flex-col gap-2.5">
    {visible.map((reminder) => {
      const look = LOOK[reminder.kind] || LOOK.month;
      const Icon = look.icon;
      return <article key={reminder.key} className={`relative flex gap-3 rounded-lg border ${look.border} bg-paper p-3.5 pr-11 animate-fade-in-up`}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${look.tone}`}><Icon size={19} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm leading-snug">{reminder.title}{reminder.amount ? <span className="font-display tabular-nums"> · {fmtBs(reminder.amount, currency)}</span> : null}</h3>
          <p className="text-xs text-ink-soft mt-0.5">{reminder.body}</p>
          <Button size="sm" variant={reminder.kind === "payday" ? "primary" : "secondary"} className="mt-2.5" onClick={() => act(reminder)}>{reminder.action.label}</Button>
        </div>
        <IconButton label={`Descartar: ${reminder.title}`} className="absolute right-1 top-1.5" onClick={() => dismiss(reminder.key)}><X size={16} aria-hidden="true" /></IconButton>
      </article>;
    })}
    <Modal open={Boolean(registering)} onClose={() => setRegistering(null)} title={registering?.action.payload?.description || (registering?.action.payload?.type === "ingreso" ? "Registrar ingreso" : "Registrar gasto")}>
      {registering ? <TransactionForm key={registering.key} initialType={registering.action.payload.type} lockType={Boolean(registering.action.payload.recurringId)} prefill={registering.action.payload} onSuccess={() => setRegistering(null)} /> : null}
    </Modal>
  </section>;
}

