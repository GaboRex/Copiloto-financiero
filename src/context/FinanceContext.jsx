import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { buildEmptyState } from "../data/mockData.js";
import { financeReducer } from "./financeReducer.js";
import { migrateState } from "../services/migrations.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { createFinanceRepository } from "../repositories/factory.js";
import { DATA_STATUS } from "../repositories/contracts.js";
import { applyWithRebase } from "../repositories/applyWithRebase.js";
import { clearImportedLocalData, createLocalBackup, fingerprintState, inspectLocalMigration, migrationId, removeMigratedLocalData } from "../services/import/localMigration.js";

const FinanceStateContext = createContext(null);
const FinanceDispatchContext = createContext(null);
const FinanceMetaContext = createContext(null);

export { financeReducer };

export function FinanceProvider({ children }) {
  const auth = useAuth();
  const [state, baseDispatch] = useReducer(financeReducer, null, buildEmptyState);
  const stateRef = useRef(state);
  const repositoryRef = useRef(null);
  const repositoryGenerationRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());
  const savedTimerRef = useRef(null);
  const [status, setStatus] = useState(DATA_STATUS.LOADING);
  const [message, setMessage] = useState("");
  const [migration, setMigration] = useState({ status: "idle", available: false, state: null, summary: null });
  // Recuerda si en esta sesión se confirmó que los datos locales ya están en la
  // nube (aunque luego se cierre el aviso), para limpiarlos al cerrar sesión.
  const localDataImportedRef = useRef(false);
  stateRef.current = state;
  if (migration.status === "completed") localDataImportedRef.current = true;

  useEffect(() => {
    let active = true;
    repositoryGenerationRef.current += 1;
    const repository = createFinanceRepository(auth.user, { guest: auth.guest });
    repositoryRef.current = repository;
    if (!repository) {
      // Sesión cerrada: si los datos del navegador ya estaban importados y
      // verificados en la nube, no los dejamos en este equipo.
      if (localDataImportedRef.current) {
        clearImportedLocalData();
        localDataImportedRef.current = false;
      }
      const empty = buildEmptyState();
      stateRef.current = empty;
      baseDispatch({ type: "LOAD_STATE", payload: empty });
      setMigration({ status: "idle", available: false, state: null, summary: null });
      setStatus(DATA_STATUS.IDLE);
      return undefined;
    }
    setStatus(DATA_STATUS.LOADING);
    repository.load().then((loaded) => {
      if (!active) return;
      const normalized = migrateState(loaded);
      stateRef.current = normalized;
      baseDispatch({ type: "LOAD_STATE", payload: normalized });
      setStatus(DATA_STATUS.IDLE);
      if (repository.mode === "supabase") {
        const local = inspectLocalMigration();
        Promise.all([
          repository.hasRemoteData(),
          local.available && local.state ? fingerprintState(local.state).then((fingerprint) => repository.getImportStatus(fingerprint)) : null,
        ]).then(([remoteExists, previousImport]) => {
          if (!active) return;
          const alreadyImported = previousImport?.status === "completed";
          setMigration((current) => ({
            ...current,
            ...local,
            remoteExists: remoteExists && !alreadyImported,
            previousImport,
            status: !local.available ? "idle" : alreadyImported ? "completed" : "pending",
          }));
        }).catch(() => {
          if (active) setMigration((current) => ({ ...current, ...local, remoteExists: true, status: local.available ? "pending" : "idle", error: "No pudimos comparar los datos locales y remotos." }));
        });
      }
    }).catch((error) => {
      if (!active) return;
      setMessage(error.userMessage || "No pudimos cargar tu información.");
      setStatus(error.code === "session_expired" ? DATA_STATUS.SESSION_EXPIRED : DATA_STATUS.ERROR);
    });
    return () => {
      active = false;
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [auth.user?.id, auth.guest]);

  const dispatch = useCallback((action) => {
    const mutation = async () => {
      const repository = repositoryRef.current;
      if (!repository) return;
      const repositoryGeneration = repositoryGenerationRef.current;
      const previousState = stateRef.current;
      const nextState = financeReducer(previousState, action);
      if (nextState === previousState) return;
      stateRef.current = nextState;
      baseDispatch({ type: "LOAD_STATE", payload: nextState });
      setStatus(DATA_STATUS.SAVING);
      setMessage("");
      try {
        const isStale = () => repositoryGeneration !== repositoryGenerationRef.current;
        const { saved, stale } = await applyWithRebase({ repository, reducer: financeReducer, action, previousState, nextState, isStale });
        if (stale || isStale()) return;
        const normalized = saved ? migrateState(saved) : nextState;
        stateRef.current = normalized;
        baseDispatch({ type: "LOAD_STATE", payload: normalized });
        setStatus(DATA_STATUS.SAVED);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setStatus((current) => current === DATA_STATUS.SAVED ? DATA_STATUS.IDLE : current), 1200);
      } catch (error) {
        if (repositoryGeneration !== repositoryGenerationRef.current) return;
        const rollbackState = error.rollbackState || previousState;
        stateRef.current = rollbackState;
        baseDispatch({ type: "LOAD_STATE", payload: rollbackState });
        setMessage(error.userMessage || "No pudimos guardar los cambios.");
        setStatus(error.code === "session_expired" ? DATA_STATUS.SESSION_EXPIRED : DATA_STATUS.ERROR);
      }
    };
    mutationQueueRef.current = mutationQueueRef.current.then(mutation, mutation);
    return mutationQueueRef.current;
  }, []);

  const importLocal = useCallback(async () => {
    const repository = repositoryRef.current;
    if (!repository || !migration.state) return;
    const repositoryGeneration = repositoryGenerationRef.current;
    setMigration((current) => ({ ...current, status: "running", error: "" }));
    try {
      const fingerprint = await fingerprintState(migration.state);
      const id = migrationId(fingerprint);
      const backupKey = createLocalBackup(migration.state, id);
      const result = await repository.importLocal(migration.state, id, fingerprint);
      if (repositoryGeneration !== repositoryGenerationRef.current) return;
      if (!result.verification?.ok) throw new Error("La importación remota terminó, pero la conciliación no coincide. Conservamos la copia local para revisarla.");
      stateRef.current = result.state;
      baseDispatch({ type: "LOAD_STATE", payload: result.state });
      setMigration((current) => ({ ...current, status: "completed", result, backupKey }));
    } catch (error) {
      if (repositoryGeneration !== repositoryGenerationRef.current) return;
      setMigration((current) => ({ ...current, status: "failed", error: error.userMessage || "No pudimos completar la importación." }));
    }
  }, [migration.state]);

  const meta = useMemo(() => ({ status, message, migration, importLocal, dismissMigration: () => setMigration((current) => ({ ...current, status: "dismissed" })), removeLocalCopy: () => { removeMigratedLocalData(migration.backupKey); setMigration((current) => ({ ...current, status: "dismissed", available: false })); }, clearMessage: () => setMessage("") }), [status, message, migration, importLocal]);

  return (
    <FinanceStateContext.Provider value={state}>
      <FinanceDispatchContext.Provider value={dispatch}>
        <FinanceMetaContext.Provider value={meta}>{children}</FinanceMetaContext.Provider>
      </FinanceDispatchContext.Provider>
    </FinanceStateContext.Provider>
  );
}

export function useFinanceState() {
  const ctx = useContext(FinanceStateContext);
  if (!ctx) throw new Error("useFinanceState debe usarse dentro de <FinanceProvider>");
  return ctx;
}

export function useFinanceDispatch() {
  const ctx = useContext(FinanceDispatchContext);
  if (!ctx) throw new Error("useFinanceDispatch debe usarse dentro de <FinanceProvider>");
  return ctx;
}

export function useFinanceMeta() {
  const ctx = useContext(FinanceMetaContext);
  if (!ctx) throw new Error("useFinanceMeta debe usarse dentro de FinanceProvider");
  return ctx;
}
