"use client";

// Katalog-Baustein `Client-Storage-Hooks-ohne-Effect`, unverändert bis auf Formatierung.
import { useCallback, useMemo, useSyncExternalStore } from "react"

/**
 * Zwei Hooks für Zustand, den nur der Browser kennt.
 *
 * Beide über `useSyncExternalStore` statt über `useState` + `useEffect`:
 * localStorage und "läuft schon im Browser" sind externe Quellen, und
 * setState im Effekt löst kaskadierende Renders aus (react-hooks/set-state-in-effect).
 */

// ============================================================
// MOUNTED
// ============================================================

const noopSubscribe = () => () => {}

/**
 * `false` beim Server-Rendern und im ersten Client-Render, danach `true`.
 * Für Werte, die serverseitig nicht bekannt sind (Theme, localStorage) und
 * sonst eine Hydration-Abweichung erzeugen würden.
 */
export function useMounted(): boolean {
    return useSyncExternalStore(
        noopSubscribe,
        () => true,
        () => false
    )
}

// ============================================================
// LOCAL STORAGE
// ============================================================

/**
 * Schreibvorgänge aus derselben Seite lösen kein `storage`-Event aus — das
 * feuert nur für andere Tabs. Deshalb ein eigener Verteiler, damit mehrere
 * Komponenten am selben Schlüssel synchron bleiben.
 */
const listeners = new Map<string, Set<() => void>>()

function subscribeToKey(key: string, callback: () => void) {
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key)!.add(callback)

    const onStorage = (event: StorageEvent) => {
        if (event.key === key) callback()
    }
    window.addEventListener('storage', onStorage)

    return () => {
        listeners.get(key)?.delete(callback)
        window.removeEventListener('storage', onStorage)
    }
}

function emit(key: string) {
    listeners.get(key)?.forEach((callback) => callback())
}

/**
 * Liest einen JSON-Wert aus dem localStorage und schreibt ihn zurück.
 *
 * Der Snapshot ist bewusst der **Roh-String** — `useSyncExternalStore`
 * vergleicht per Identität, ein frisch geparstes Objekt pro Aufruf würde
 * endlos neu rendern. Geparst wird erst danach in `useMemo`.
 *
 * Server-Snapshot ist immer `null` → `fallback`, damit Server- und erstes
 * Client-Render übereinstimmen.
 */
export function useLocalStorageState<T>(key: string, fallback: T): [T, (value: T) => void] {
    const raw = useSyncExternalStore(
        useCallback((callback: () => void) => subscribeToKey(key, callback), [key]),
        () => {
            try {
                return localStorage.getItem(key)
            } catch {
                return null
            }
        },
        () => null
    )

    const value = useMemo<T>(() => {
        if (raw === null) return fallback
        try {
            return JSON.parse(raw) as T
        } catch {
            // Defekter oder alter, nicht-JSON Eintrag darf die UI nicht kippen
            return fallback
        }
        // fallback bewusst nicht in den Dependencies: ein inline übergebenes
        // Array/Objekt wäre bei jedem Render neu und würde das Memo entwerten.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raw])

    const setValue = useCallback(
        (next: T) => {
            try {
                localStorage.setItem(key, JSON.stringify(next))
            } catch {
                // Storage kann blockiert sein (Private Mode, Quota) — dann bleibt
                // der Wert nur für diese Sitzung im Speicher der anderen Tabs aus.
            }
            emit(key)
        },
        [key]
    )

    return [value, setValue]
}
