import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Persiste estado de UI em sessionStorage, versionado por chave.
 * Leitura síncrona no 1º render do cliente (lazy useState) — sem flash de
 * initialValue → dados.
 */

type PersistedEnvelope<T> = {
  version: number;
  value: T;
};

const memoryFallback = new Map<string, string>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function storageKey(key: string): string {
  return `lf.route-state.${key}`;
}

function readRaw(key: string): string | null {
  if (!isBrowser()) return memoryFallback.get(key) ?? null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string): void {
  if (!isBrowser()) {
    memoryFallback.set(key, raw);
    return;
  }
  try {
    window.sessionStorage.setItem(key, raw);
  } catch {
    memoryFallback.set(key, raw);
  }
}

function removeRaw(key: string): void {
  if (!isBrowser()) {
    memoryFallback.delete(key);
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    memoryFallback.delete(key);
  }
}

function readPersisted<T>(key: string, version: number, initialValue: T): T {
  const raw = readRaw(storageKey(key));
  if (!raw) return initialValue;
  try {
    const parsed = JSON.parse(raw) as PersistedEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || parsed.version !== version) {
      return initialValue;
    }
    return parsed.value;
  } catch {
    return initialValue;
  }
}

/**
 * @param key Identificador estável (ex.: "prospeccao.session").
 * @param initialValue Valor se não houver nada salvo.
 * @param version Incremente quando o shape de T mudar.
 */
export function usePersistedRouteState<T>(
  key: string,
  initialValue: T,
  version = 1,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Lazy init: no browser já lê sessionStorage no 1º render (sem flash).
  // No SSR / 1º paint sem window → initialValue (sem mismatch grave porque
  // rotas autenticadas usam ssr: false).
  const [state, setState] = useState<T>(() =>
    isBrowser() ? readPersisted(key, version, initialValue) : initialValue,
  );

  const keyRef = useRef(key);
  keyRef.current = key;
  const versionRef = useRef(version);
  versionRef.current = version;

  // Se a chave/versão mudar em runtime, relê
  useEffect(() => {
    setState(readPersisted(key, version, initialValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  useEffect(() => {
    const envelope: PersistedEnvelope<T> = { version, value: state };
    try {
      writeRaw(storageKey(key), JSON.stringify(envelope));
    } catch {
      /* ignore */
    }
  }, [key, version, state]);

  const update = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => (typeof value === "function" ? (value as (prev: T) => T)(prev) : value));
  }, []);

  const clear = useCallback(() => {
    removeRaw(storageKey(keyRef.current));
    setState(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [state, update, clear];
}
