// CLIENT COMPONENT: it responds to clicks, reads the OS colour preference and
// writes localStorage. All three only exist in the browser.
'use client'

import { useSyncExternalStore } from 'react'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { THEME_STORAGE_KEY, type ThemeChoice } from '@/lib/theme'

const CHANGE_EVENT = 'staybook-theme-change'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** The theme actually showing: a saved choice, or else the OS setting. */
function currentTheme(): ThemeChoice {
  const attr = document.documentElement.dataset.theme
  if (attr === 'light' || attr === 'dark') return attr
  return darkQuery().matches ? 'dark' : 'light'
}

function subscribe(onChange: () => void) {
  const media = darkQuery()
  media.addEventListener('change', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function choose(theme: ThemeChoice) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage blocked (some private modes): still switch for this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/**
 * One button that switches between light and dark. The server can't know
 * the theme, so it renders a neutral button (null snapshot) and the browser
 * fills in the real state after hydration, so hydration never disagrees.
 * The colours are already right before that: the <head> script set them.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<ThemeChoice | null>(subscribe, currentTheme, () => null)
  const next: ThemeChoice = theme === 'dark' ? 'light' : 'dark'
  const label = theme ? `Switch to ${next} theme` : 'Switch colour theme'

  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={label}
      title={label}
      className={button.icon}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}
