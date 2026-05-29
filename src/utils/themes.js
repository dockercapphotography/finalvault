/**
 * themes.js — Single source of truth for all gallery color themes.
 *
 * To add a new theme: add one entry to THEMES. That's it.
 * Existing galleries with old theme keys will fall back to 'light' gracefully.
 *
 * Each theme has:
 *   id        — stored in DB, never change these
 *   label     — displayed in UI
 *   bg        — page background
 *   surface   — card / panel background
 *   text      — primary text
 *   muted     — secondary text
 *   border    — border color
 *   accent    — accent / highlight color
 */

export const THEMES = [
  {
    id: 'light',
    label: 'Light',
    bg: '#ffffff', surface: '#f8f8f8', text: '#1a1a1a',
    muted: '#6b7280', border: '#e5e7eb', accent: '#6366f1',
  },
  {
    id: 'dark',
    label: 'Dark',
    bg: '#111111', surface: '#1e1e1e', text: '#f0f0f0',
    muted: '#9ca3af', border: '#333333', accent: '#6366f1',
  },
  {
    id: 'slate',
    label: 'Slate',
    bg: '#f0f2f5', surface: '#e2e6ea', text: '#1a2030',
    muted: '#6a7a8a', border: '#c8d0da', accent: '#4a6080',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    bg: '#f5f3f8', surface: '#ede8f5', text: '#1a1030',
    muted: '#7a6a90', border: '#d8d0ea', accent: '#7c5cbf',
  },
  {
    id: 'ember',
    label: 'Ember',
    bg: '#1a1208', surface: '#2a1e0e', text: '#f0e8d8',
    muted: '#a89070', border: '#3a2e1a', accent: '#c8862a',
  },
  {
    id: 'sage',
    label: 'Sage',
    bg: '#f4f6f3', surface: '#e6ebe4', text: '#1a2018',
    muted: '#6a7a68', border: '#ccd4ca', accent: '#5a7a56',
  },
  {
    id: 'blush',
    label: 'Blush',
    bg: '#fdf6f4', surface: '#f5e8e4', text: '#2a1a18',
    muted: '#9a7a78', border: '#e8d0cc', accent: '#c4706a',
  },
  {
    id: 'noir',
    label: 'Noir',
    bg: '#1c1c1e', surface: '#2c2c2e', text: '#f0f0f2',
    muted: '#8a8a92', border: '#3a3a3c', accent: '#a0a0a8',
  },
]

// Lookup map for fast access by id
export const THEME_MAP = Object.fromEntries(THEMES.map(t => [t.id, t]))

// Fallback for unknown theme ids (e.g. old galleries with deprecated theme keys)
export function getTheme(id) {
  return THEME_MAP[id] || THEME_MAP['light']
}

// CSS variable object for use in style props
export function getThemeVars(id) {
  const t = getTheme(id)
  return {
    '--bg': t.bg,
    '--surface': t.surface,
    '--surface-raised': t.surface,
    '--text': t.text,
    '--text-muted': t.muted,
    '--text-secondary': t.muted,
    '--border': t.border,
    '--accent': t.accent,
  }
}
