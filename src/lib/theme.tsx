"use client"

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "vms-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Single source of truth for day/night mode across all pages.
 * - Persisted to localStorage so the choice survives navigation and reloads.
 * - Shared via React context so every page/component sees the same mode.
 * - Backed by useSyncExternalStore: no hydration mismatch, no setState-in-effect.
 * - Defaults to dark (matching the app's previous behavior).
 */
function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage unavailable — keep default */
  }
  return "dark";
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  function onStorage(e: StorageEvent) {
    // Keep multiple open tabs in sync.
    if (e.key === STORAGE_KEY) callback();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Theme {
  return readStoredTheme();
}

function getServerSnapshot(): Theme {
  return "dark";
}

function setTheme(next: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* localStorage unavailable — state still works in-session */
  }
  listeners.forEach((listener) => listener());
}

function toggleTheme() {
  setTheme(getSnapshot() === "dark" ? "light" : "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Mirror the mode onto <html> for CSS-level theming (native form controls, scrollbars).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === "dark", setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback (should not happen when wrapped in ThemeProvider).
    return { theme: "dark", isDark: true, setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}
