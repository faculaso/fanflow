import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircuitBoard,
  Fan as FanIcon,
  type LucideIcon,
} from 'lucide-react';
import type { CurvePoint, TempSource } from './types';

/** Best-effort icon match for both the fixed demo categories and raw sensor names from real hardware. */
export function getFanIcon(name: string): LucideIcon {
  const key = name.toLowerCase();
  if (key.includes('pump') || key.includes('aio')) return FanIcon;
  if (key.includes('gpu')) return CircuitBoard;
  if (key.includes('intake') || key.includes('front')) return ArrowDownToLine;
  if (key.includes('exhaust') || key.includes('rear') || key.includes('top')) return ArrowUpFromLine;
  return FanIcon;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Piecewise-linear interpolation of a fan curve at a given temperature. */
export function interpolateCurve(curve: CurvePoint[], temp: number): number {
  const pts = [...curve].sort((a, b) => a.temp - b.temp);
  if (temp <= pts[0].temp) return pts[0].speed;
  const last = pts[pts.length - 1];
  if (temp >= last.temp) return last.speed;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (temp >= a.temp && temp <= b.temp) {
      const ratio = (temp - a.temp) / (b.temp - a.temp);
      return Math.round(a.speed + ratio * (b.speed - a.speed));
    }
  }
  return last.speed;
}

/** Same VRM approximation used by the sensors view: CPU temp + offset. */
export function getSourceTemp(
  source: TempSource,
  cpuTemp: number,
  gpuTemp: number,
): number {
  if (source === 'CPU') return cpuTemp;
  if (source === 'GPU') return gpuTemp;
  return clamp(cpuTemp + 6, 30, 95);
}

export interface TempColorSet {
  /** CSS colour (theme variable) for strokes, fills and inline styles. */
  color: string;
  text: string;
  label: string;
}

/** Cool below 40°C, warm through the mid-band, hot from 80°C. */
export function getTempColor(temp: number): TempColorSet {
  if (temp >= 80) return { color: 'var(--hot)', text: 'text-hot', label: 'Crítica' };
  if (temp >= 40) return { color: 'var(--warm)', text: 'text-accent-ink', label: 'Normal' };
  return { color: 'var(--cool)', text: 'text-cool', label: 'Fresca' };
}

/** Maps a Celsius reading onto a 0-100 gauge fill (20°C empty, 100°C full). */
export function tempToGauge(temp: number): number {
  return clamp(((temp - 20) / 80) * 100, 0, 100);
}

export function formatRpm(rpm: number): string {
  return rpm <= 0 ? '0 RPM' : `${rpm.toLocaleString('es-AR')} RPM`;
}
