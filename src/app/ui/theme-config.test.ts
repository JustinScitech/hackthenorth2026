import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_THEME, isTheme, THEME_STORAGE_KEY, themeInitScript } from "./theme-config";

test("theme guard accepts only supported themes", () => {
  assert.equal(isTheme("dark"), true);
  assert.equal(isTheme("light"), true);
  assert.equal(isTheme("system"), false);
  assert.equal(isTheme(null), false);
});

test("pre-hydration theme script uses the saved value and defaults safely", () => {
  const script = new Function("localStorage", "document", themeInitScript);
  const document = { documentElement: { dataset: { theme: "" } } };
  script({ getItem: (key: string) => key === THEME_STORAGE_KEY ? "light" : null }, document);
  assert.equal(document.documentElement.dataset.theme, "light");
  script({ getItem: () => "invalid" }, document);
  assert.equal(document.documentElement.dataset.theme, DEFAULT_THEME);
  script({ getItem: () => { throw new Error("unavailable"); } }, document);
  assert.equal(document.documentElement.dataset.theme, DEFAULT_THEME);
});
