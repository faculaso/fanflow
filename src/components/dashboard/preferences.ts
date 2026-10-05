import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type TempUnit = 'C' | 'F';

export interface UiPreferences {
  theme: Theme;
  unit: TempUnit;
  criticalAlerts: boolean;
}

const STORAGE_KEY = 'fanflow:ui';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function load(): UiPreferences {
  const defaults: UiPreferences = { theme: systemTheme(), unit: 'C', criticalAlerts: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function applyTheme(theme: Theme = current.theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  window.appWindow?.setTheme(theme);
}

export function setPreferences(patch: Partial<UiPreferences>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // storage unavailable; the choice still applies for this session
  }
  applyTheme();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences(): UiPreferences {
  return useSyncExternalStore(subscribe, () => current);
}

/** Converts a Celsius reading for display; all internal math stays in Celsius. */
export function toUnit(celsius: number, unit: TempUnit): number {
  return unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
}

export function formatTemp(celsius: number | null, unit: TempUnit, withUnit = true): string {
  if (celsius === null) return 'N/D';
  const value = Math.round(toUnit(celsius, unit));
  return withUnit ? `${value}°${unit}` : `${value}°`;
}
