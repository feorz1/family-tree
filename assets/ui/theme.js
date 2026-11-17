(() => {
  const key = "family-tree-theme";
  const modes = ["light", "dark", "system", "time"];
  const system = matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  const listeners = new Set();
  const normalize = value => modes.includes(value) ? value : "light";
  let mode = "light";
  let timer;

  try { mode = normalize(localStorage.getItem(key)); } catch {}

  function apply() {
    clearTimeout(timer);
    const now = new Date();
    const hour = now.getHours();
    const dark = mode === "dark" || (mode === "system" && system.matches) ||
      (mode === "time" && (hour < 7 || hour >= 19));
    root.classList.toggle("dark", dark);
    if (mode === "time") {
      const next = new Date(now);
      if (hour >= 19) next.setDate(next.getDate() + 1);
      next.setHours(hour >= 7 && hour < 19 ? 19 : 7, 0, 0, 0);
      timer = setTimeout(apply, next - now);
    }
  }

  function change(value) {
    mode = normalize(value);
    apply();
    for (const listener of listeners) listener();
  }

  system.addEventListener("change", apply);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) apply();
  });
  window.addEventListener("focus", apply);
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) change(event.newValue);
  });

  window.familyTheme = {
    get: () => mode,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      change(value);
      try { localStorage.setItem(key, mode); } catch {}
    }
  };

  apply();
})();
