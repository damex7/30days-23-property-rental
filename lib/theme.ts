// Shared by the inline <head> script (app/layout.tsx) and the ThemeToggle.

export const THEME_STORAGE_KEY = 'staybook-theme'

export type ThemeChoice = 'light' | 'dark'

/**
 * Runs in <head> before the page is painted, so a saved dark theme never
 * flashes light first. Plain ES5 in a string because it runs before React or
 * any bundle has loaded.
 *
 * Why not a cookie read by the server? Under Cache Components, reading
 * cookies() in the root layout would make EVERY page dynamic, just to pick
 * a colour. The script keeps every page's HTML static and identical for
 * everyone; only this one attribute differs per visitor.
 *
 * - A saved "light"/"dark" choice is written to data-theme on <html>.
 * - With no saved choice there is no attribute, and `color-scheme: light dark`
 *   in globals.css follows the OS with no script at all.
 * - If localStorage is blocked, the catch leaves the OS theme in place.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`
