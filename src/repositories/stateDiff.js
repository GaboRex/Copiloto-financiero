// Calcula qué cambió entre dos estados financieros para enviar al servidor solo
// eso (altas/ediciones y bajas por id) en lugar del estado completo.

const COLLECTIONS = ["accounts", "goals", "transactions", "debts", "recurringExpenses", "recurringIncomes", "savingsContributions"];
const SETTINGS_KEYS = ["emergencyFund", "financialSettings", "sectionGuidesSeen", "currencyHistory"];
// El saldo lo calcula el servidor a partir del libro; no se considera un cambio de la cuenta.
const IGNORED_FIELDS = { accounts: new Set(["balance"]) };

function comparable(item, ignored) {
  if (!ignored || !item || typeof item !== "object") return item;
  const copy = { ...item };
  for (const field of ignored) delete copy[field];
  return copy;
}

function sameValue(a, b, ignored) {
  if (a === b) return true;
  return JSON.stringify(comparable(a, ignored)) === JSON.stringify(comparable(b, ignored));
}

function diffCollection(previous = [], next = [], ignored) {
  const before = new Map(previous.map((item) => [item.id, item]));
  const upsert = [];
  for (const item of next) {
    const old = before.get(item.id);
    if (!old || !sameValue(old, item, ignored)) upsert.push(item);
    before.delete(item.id);
  }
  return { upsert, remove: [...before.keys()] };
}

export function buildFinanceChanges(previousState, nextState) {
  const changes = { upsert: {}, remove: {} };
  for (const key of COLLECTIONS) {
    const { upsert, remove } = diffCollection(previousState?.[key], nextState?.[key], IGNORED_FIELDS[key]);
    if (upsert.length) changes.upsert[key] = upsert;
    if (remove.length) {
      const target = key === "recurringExpenses" || key === "recurringIncomes" ? "recurring" : key;
      changes.remove[target] = [...(changes.remove[target] || []), ...remove];
    }
  }
  if (!sameValue(previousState?.profile, nextState?.profile)) changes.profile = nextState.profile;
  if (SETTINGS_KEYS.some((key) => !sameValue(previousState?.[key], nextState?.[key]))) {
    changes.settings = Object.fromEntries(SETTINGS_KEYS.map((key) => [key, nextState[key]]));
  }
  return changes;
}

export function isEmptyChange(changes) {
  return !changes.profile && !changes.settings
    && Object.keys(changes.upsert).length === 0 && Object.keys(changes.remove).length === 0;
}

// Aplica los saldos oficiales devueltos por el servidor sobre el estado local.
export function applyServerBalances(state, balances) {
  if (!balances) return state;
  return {
    ...state,
    accounts: state.accounts.map((account) => (account.id in balances
      ? { ...account, balance: Math.round(Number(balances[account.id]) * 100) / 100 }
      : account)),
  };
}
