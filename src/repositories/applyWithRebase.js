import { migrateState } from "../services/migrations.js";

// Guarda una acción. Si el servidor responde que otro dispositivo guardó antes
// (conflicto de revisión), recarga lo último y reaplica la misma intención sobre
// esos datos una sola vez. Devuelve el estado guardado y el estado al que volver
// si algo falla después de la recarga.
export async function applyWithRebase({ repository, reducer, action, previousState, nextState, isStale = () => false }) {
  try {
    return { saved: await repository.apply({ action, previousState, nextState }), rollbackState: previousState };
  } catch (error) {
    if (error.code !== "conflict") throw Object.assign(error, { rollbackState: previousState });
    const fresh = migrateState(await repository.load());
    if (isStale()) return { stale: true };
    const rebased = reducer(fresh, action);
    if (rebased === fresh) return { saved: fresh, rollbackState: fresh };
    try {
      return { saved: await repository.apply({ action, previousState: fresh, nextState: rebased }), rollbackState: fresh };
    } catch (retryError) {
      throw Object.assign(retryError, { rollbackState: fresh });
    }
  }
}
