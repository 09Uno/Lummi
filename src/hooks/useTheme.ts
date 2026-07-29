import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "cy-theme";

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* private mode */
  }
  return "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Inline-script-safe bootstrap — call from <head> to avoid FOUC */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="light";var r=document.documentElement;r.setAttribute("data-theme",t);if(t==="dark")r.classList.add("dark");else r.classList.remove("dark");}catch(e){}})();`;

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return readTheme();
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mode = readTheme();
    setThemeState(mode);
    applyTheme(mode);
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setThemeState(e.newValue);
        applyTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    applyTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme, ready };
}
