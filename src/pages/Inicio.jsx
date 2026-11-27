import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, ArrowRight, BarChart3, Bot, Check, ChevronRight, Circle, Minus, Plus, ShoppingBag, Target, WalletCards } from "lucide-react";
import { useFinanceState } from "../context/FinanceContext.jsx";
import { Button, Card, ProgressBar } from "../components/ui/primitives.jsx";
import { FinancialScoreGauge } from "../components/finance/FinancialScoreGauge.jsx";
import { InsightCard } from "../components/finance/cards.jsx";
import { SectionGuide } from "../components/SectionGuide.jsx";
import { useCountUp } from "../hooks/useCountUp.js";
import { BudgetsOverview } from "../components/budgets/BudgetsPanel.jsx";
import { RemindersStack } from "../components/reminders/RemindersStack.jsx";
import { InstallAppCard } from "../components/pwa/InstallApp.jsx";
import { NotificationPrompt } from "../components/pwa/NotificationsPanel.jsx";
import { calculateAvailableMoney, calculateFinancialHealth, getEmergencyFundStatus, getSavingsRealized, getUpcomingCommitments, hasFinancialData } from "../services/financial/calculations.js";
import { getFinancialDataReadiness } from "../services/financial/readiness.js";
import { getMainInsight } from "../services/financial/insights.js";
import { fmtBs, fmtFecha, fmtPct } from "../services/financial/format.js";

const BREAKDOWN_LABELS = { flujoCaja: "Flujo de caja", reserva: "Reserva financiera", endeudamiento: "Endeudamiento", planificacion: "Planificación" };
const plural = (count, singular, multiple) => `${count} ${count === 1 ? singular : multiple}`;

export default function Inicio() {
  const state = useFinanceState();
  const navigate = useNavigate();
  const readiness = getFinancialDataReadiness(state);
  const hasAccounts = state.accounts.some((account) => account.type !== "tarjeta_credito");
  const today = new Date().toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });
  const showSummary = hasFinancialData(state);
  return <div className="flex flex-col gap-5 md:gap-6 stagger">
    <div><p className="text-ink-soft text-sm first-letter:uppercase">{today}</p><h1 className="font-display text-2xl font-semibold">Hola, {state.profile.name}</h1></div>
    {/* Lo primero que se ve: cuánto puedo gastar y cómo registrar un movimiento. */}
    <RemindersStack />
    {hasAccounts ? <AvailableHero state={state} navigate={navigate} /> : null}
    <NotificationPrompt />
    <InstallAppCard />
    {!hasAccounts ? <Card><p className="font-display text-lg font-semibold">Añade dónde guardas tu dinero</p><p className="text-ink-soft text-sm mt-2">Necesitas al menos una cuenta de activo para calcular saldos y proyecciones.</p><Button className="mt-4" onClick={() => navigate("/cuentas")}>Añadir cuenta</Button></Card> : null}
    {hasAccounts && !readiness.firstMovements.complete ? <FirstMovementsCard progress={readiness.firstMovements} navigate={navigate} /> : null}
    <div className="grid sm:grid-cols-2 gap-3">
      <HighlightedAccess icon={ShoppingBag} title="¿Puedo comprarlo?" text="Evalúa una compra antes de hacerla." onClick={() => navigate("/puedo-comprarlo")} />
      <HighlightedAccess icon={Bot} title="Preguntar al Copiloto" text="Respuestas con tus propias cifras." onClick={() => navigate("/copiloto")} />
    </div>
    <BudgetsOverview onOpen={() => navigate("/planes?tab=presupuestos")} />
    {showSummary ? <FinancialSummary state={state} navigate={navigate} readiness={readiness} /> : null}
    <WhatYouCanDo state={state} navigate={navigate} />
    <SectionGuide section="home" />
  </div>;
}

function AvailableHero({ state, navigate }) {
  const { totalBalance, committed, available } = calculateAvailableMoney(state);
  const currency = state.profile.currency;
  const animatedAvailable = useCountUp(available);
  return <section aria-labelledby="available-title" className="relative overflow-hidden rounded-xl bg-teal text-paper p-5 md:p-6 shadow-card">
    <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-paper/10" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full border border-paper/10" />
    <div className="relative flex items-start justify-between gap-3">
      <h2 id="available-title" className="text-sm text-paper/85">Disponible para gastar</h2>
      <button onClick={() => navigate("/cuentas")} aria-label="Ver y editar cuentas" className="-mt-2 -mr-2 inline-flex items-center gap-0.5 rounded px-2 min-h-[40px] text-sm text-paper/85 hover:text-paper hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper">Cuentas<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <p className={`relative font-display text-4xl md:text-5xl font-semibold tabular-nums mt-1 ${available < 0 ? "text-[#F6C9BE]" : ""}`}>{fmtBs(animatedAvailable, currency)}</p>
    <p className="relative text-sm text-paper/85 mt-2 tabular-nums">{fmtBs(totalBalance, currency)} en cuentas · {fmtBs(committed, currency)} comprometido en 30 días</p>
    <div className="relative grid grid-cols-2 gap-2 mt-5">
      <button onClick={() => navigate("/movimientos?nuevo=gasto")} className="min-h-[48px] rounded bg-paper text-ink font-medium inline-flex items-center justify-center gap-2 hover:bg-paper-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-teal"><Minus size={18} aria-hidden="true" />Gasto</button>
      <button onClick={() => navigate("/movimientos?nuevo=ingreso")} className="min-h-[48px] rounded border border-paper/60 text-paper font-medium inline-flex items-center justify-center gap-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-teal"><Plus size={18} aria-hidden="true" />Ingreso</button>
    </div>
  </section>;
}

function FirstMovementsCard({ progress, navigate }) {
  const completed = Number(progress.hasIncome) + Number(progress.hasExpense);
  return <Card className="border-teal/40 bg-teal/[0.04]"><div className="grid lg:grid-cols-[1fr_auto] gap-5 items-center"><div>
    <p className="font-display text-xl font-semibold">Completa tus primeros movimientos</p>
    <p className="text-sm text-ink-soft mt-1">Registrar ingresos y gastos reales permitirá calcular análisis, proyecciones e insights fiables.</p>
    <div className="mt-4 max-w-md"><ProgressBar value={(completed / 2) * 100} /></div>
    <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm"><ProgressItem done={progress.hasIncome}>Registrar primer ingreso real</ProgressItem><ProgressItem done={progress.hasExpense}>Registrar primer gasto real</ProgressItem></div>
  </div><div className="flex flex-wrap lg:flex-col gap-2">
    {!progress.hasIncome ? <Button onClick={() => navigate("/movimientos?nuevo=ingreso")}>Registrar ingreso</Button> : null}
    {!progress.hasExpense ? <Button onClick={() => navigate("/movimientos?nuevo=gasto")} variant={progress.hasIncome ? "primary" : "secondary"}>Registrar gasto</Button> : null}
  </div></div></Card>;
}

function ProgressItem({ done, children }) { const Icon = done ? Check : Circle; return <span className={`flex items-center gap-2 ${done ? "text-teal" : "font-medium"}`}><Icon size={15} aria-hidden="true" />{children}</span>; }

function HighlightedAccess({ icon: Icon, title, text, onClick }) { return <button onClick={onClick} className="group text-left border border-line rounded-lg p-4 bg-paper transition duration-200 hover:-translate-y-0.5 hover:shadow-card hover:border-line-strong/50 active:translate-y-0 flex items-center gap-3 min-h-[64px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><span className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center shrink-0"><Icon size={18} className="text-teal" aria-hidden="true" /></span><span className="flex-1 min-w-0"><span className="font-display font-semibold block">{title}</span><span className="text-ink-soft text-sm block">{text}</span></span><ChevronRight size={18} className="text-ink-soft shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></button>; }

function FinancialSummary({ state, navigate, readiness }) {
  const health = calculateFinancialHealth(state);
  const month = readiness.latestMonth;
  const comparison = readiness.comparison?.available ? readiness.comparison : null;
  const savingsRealized = getSavingsRealized(state);
  const commitments = getUpcomingCommitments(state, 30).slice(0, 4);
  const projection = readiness.monthEndProjection;
  return <div className="flex flex-col gap-5">
    <div className="grid md:grid-cols-2 gap-5">
      <Card title="Salud financiera">{!health.available ? <MissingState title="Salud financiera aún no disponible" text={`Falta: ${health.missing.join(", ")}.`} onClick={() => navigate("/analisis?config=health")} /> : <><FinancialScoreGauge score={health.score} /><p className="text-sm text-ink-soft mt-3">{health.resumen} Confianza {health.confidence}.</p><div className="mt-4 flex flex-col gap-2">{Object.entries(health.breakdown).map(([key, item]) => <div key={key}><div className="flex justify-between text-xs mb-1"><span>{BREAKDOWN_LABELS[key]} · {Math.round(item.weight * 100)}%</span><span>{item.score}%</span></div><ProgressBar value={item.score} /></div>)}</div><Link to="/analisis" className="text-ochre-ink text-sm underline underline-offset-2 mt-3 inline-flex items-center min-h-[40px]">Ver criterios y acciones</Link></>}</Card>
      <Card title="Resumen mensual"><div className="flex flex-col gap-2 text-sm"><MoneyRow label="Ingresos del mes" value={month.ingresos} currency={state.profile.currency} /><MoneyRow label="Gastos del mes" value={-month.gastos} currency={state.profile.currency} /><MoneyRow label="Balance neto del mes" value={month.balanceNeto} currency={state.profile.currency} strong /><MoneyRow label="Ahorro realizado" value={savingsRealized} currency={state.profile.currency} /></div>{comparison ? <p className="text-xs text-ink-soft mt-3">Comparación equivalente: {comparison.current.start} a {comparison.current.end} frente a {comparison.previous.start} a {comparison.previous.end}.</p> : <p className="text-xs text-ink-soft mt-3">La comparación aparecerá cuando ambos periodos tengan ingresos y gastos reales.</p>}</Card>
      <Card title="Proyección al cierre del mes" className="md:col-span-2">{!projection.available ? <MissingState title="Proyección aún no disponible" text={`Falta: ${projection.missing.join(", ")}.`} onClick={() => navigate("/analisis?config=projection")} /> : <><div className="font-display text-3xl font-semibold">{fmtBs(projection.end, state.profile.currency)}</div><p className="text-ink-soft text-sm mt-1">Del {projection.startDate} al {projection.endDate} · {plural(projection.days, "día", "días")} · confianza {projection.confidence}.</p><Link to="/analisis" className="text-ochre-ink text-sm underline underline-offset-2 mt-2 inline-flex items-center min-h-[40px]">Ver fórmula y próximos 30 días</Link></>}</Card>
    </div>
    <Card title="Próximos compromisos"><div className="flex flex-col">{commitments.map((item) => <div key={`${item.id}-${item.date}`} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 border-b border-dotted border-line last:border-none text-sm"><span>{item.name}</span><span className="text-ink-soft">{fmtFecha(item.date)}</span><span className="tabular-nums">− {fmtBs(item.amount, state.profile.currency)}</span></div>)}{commitments.length === 0 ? <p className="text-ink-soft text-sm">No hay compromisos próximos registrados. Añádelos en Movimientos o Planes.</p> : null}</div></Card>
    <Card title="Tu principal insight"><InsightCard insight={getMainInsight(state)} /><Link to="/analisis" className="text-ochre-ink text-sm underline underline-offset-2 mt-3 inline-flex items-center min-h-[40px]">Ver análisis</Link></Card>
  </div>;
}

function MissingState({ title, text, onClick }) { return <div className="py-4"><p className="font-medium">{title}</p><p className="text-sm text-ink-soft mt-2">{text}</p><Button className="mt-4" size="sm" onClick={onClick}>Completar datos</Button></div>; }
function MoneyRow({ label, value, currency, strong }) { return <div className={`flex justify-between leader-dotted pb-1.5 ${strong ? "font-semibold" : ""}`}><span className={strong ? "" : "text-ink-soft"}>{label}</span><span className="tabular-nums">{fmtBs(value, currency)}</span></div>; }

function WhatYouCanDo({ state, navigate }) {
  const goals = state.goals.length;
  const emergency = getEmergencyFundStatus(state);
  const movements = state.transactions.length;
  const items = [
    { icon: WalletCards, title: "Cuentas", text: "Consulta saldos y registra ajustes trazables.", sub: plural(state.accounts.length, "cuenta", "cuentas"), to: "/cuentas" },
    { icon: ArrowLeftRight, title: "Movimientos", text: "Registra y organiza ingresos y gastos.", sub: plural(movements, "movimiento registrado", "movimientos registrados"), to: "/movimientos" },
    { icon: Target, title: "Planes", text: "Define objetivos, fondo de emergencia y deudas.", sub: goals ? `${plural(goals, "objetivo", "objetivos")} · Fondo ${fmtPct(emergency.progresoPct)}` : "Configura tu primer objetivo", to: "/planes" },
    { icon: BarChart3, title: "Análisis", text: "Revisa salud, periodos equivalentes y proyecciones.", sub: "Cálculos y supuestos explicados", to: "/analisis" },
    { icon: Bot, title: "Copiloto", text: "Haz preguntas concretas sobre tus finanzas.", sub: "Respuestas basadas en tus datos", to: "/copiloto" },
    { icon: ShoppingBag, title: "¿Puedo comprarlo?", text: "Mide el impacto antes de gastar.", sub: "Liquidez, reserva y compromisos", to: "/puedo-comprarlo" },
  ];
  return <div><h2 className="font-display font-semibold text-lg mb-3">¿Qué puedes hacer?</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">{items.map((item) => <button key={item.to} onClick={() => navigate(item.to)} className="group text-left border border-line rounded-lg p-4 bg-paper transition duration-200 hover:-translate-y-0.5 hover:shadow-card hover:border-line-strong/50 flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><span className="flex items-center gap-2"><item.icon size={16} className="text-teal" aria-hidden="true" /><span className="font-medium text-sm">{item.title}</span></span><span className="text-ink-soft text-xs">{item.text}</span><span className="flex items-center justify-between mt-1"><span className="text-xs text-ink-soft">{item.sub}</span><ArrowRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></span></button>)}</div></div>;
}
