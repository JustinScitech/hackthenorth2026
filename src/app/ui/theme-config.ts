export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "underwriting-review.theme";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/** Runs before hydration so the saved theme applies without a flash of the default. */
export const themeInitScript = `(function(){var d=${JSON.stringify(DEFAULT_THEME)};var t=d;try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="light"||s==="dark")t=s;}catch(e){}document.documentElement.dataset.theme=t;})();`;
