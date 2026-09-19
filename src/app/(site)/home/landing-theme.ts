/** Landing-page theme. Light by default; the visitor's choice is remembered separately from the workspace theme. */
export type LandingTheme = "light" | "dark";

export const DEFAULT_LANDING_THEME: LandingTheme = "light";
export const LANDING_THEME_KEY = "astra.home-theme";

export function isLandingTheme(value: unknown): value is LandingTheme {
  return value === "light" || value === "dark";
}

/**
 * Runs while the landing page HTML is still parsing, so a saved dark preference applies
 * before first paint. It targets the element that contains the script tag.
 */
export const landingThemeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(LANDING_THEME_KEY)});var e=document.currentScript&&document.currentScript.parentElement;if(e&&(t==="dark"||t==="light"))e.setAttribute("data-theme",t);}catch(e){}})();`;

/** Stores a theme for the landing page. Open tabs pick it up through the storage event. */
export function setLandingTheme(theme: LandingTheme) {
  try {
    localStorage.setItem(LANDING_THEME_KEY, theme);
  } catch {
    /* storage may be unavailable */
  }
  document.querySelector<HTMLElement>("main[data-theme]")?.setAttribute("data-theme", theme);
}
