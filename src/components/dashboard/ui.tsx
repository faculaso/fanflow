import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export function GlassCard({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger index for the entrance animation. */
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: delay * 0.05, ease: 'easeOut' }}
      className={`glass rounded-[24px] p-5 ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Round white chip holding a coloured icon, like the reference's card badges. */
export function IconBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`chip-shadow flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip-active text-accent ${className}`}
    >
      {children}
    </span>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconBadge>{icon}</IconBadge>}
        <div className="min-w-0 leading-tight">
          <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}

/** Accessible switch. The knob is pinned with an explicit left offset (the old one
 *  relied on the button's centred text alignment and drifted). */
export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'accent-gradient' : 'bg-track'
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? 22 : 3 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className="absolute left-0 top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Pill group; the active pill gets the orange gradient like the reference's "12 watt". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  size = 'md',
  className = '',
}: SegmentedProps<T>) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-[13px]';
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-full font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${
              active
                ? 'accent-gradient chip-shadow text-white'
                : 'bg-chip-active/70 text-ink hover:bg-chip-active'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function useGradientId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

const ARC_RADIUS = 40;
const ARC_LENGTH = ARC_RADIUS * 1.5 * Math.PI; // 270° sweep

/** 270° arc gauge open at the bottom, as on the reference thermostat. */
export function ArcGauge({
  value,
  size = 150,
  from = 'var(--accent)',
  to = 'var(--accent-2)',
  children,
}: {
  /** 0-100 */
  value: number;
  size?: number;
  from?: string;
  to?: string;
  children?: ReactNode;
}) {
  const id = useGradientId('arc');
  const clamped = Math.min(100, Math.max(0, value));
  const path = 'M 21.72 78.28 A 40 40 0 1 1 78.28 78.28';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: from }} />
            <stop offset="100%" style={{ stopColor: to }} />
          </linearGradient>
        </defs>
        <path d={path} fill="none" strokeWidth={9} strokeLinecap="round" style={{ stroke: 'var(--track)' }} />
        <motion.path
          d={path}
          fill="none"
          strokeWidth={9}
          strokeLinecap="round"
          stroke={`url(#${id})`}
          strokeDasharray={ARC_LENGTH}
          initial={false}
          animate={{ strokeDashoffset: ARC_LENGTH * (1 - clamped / 100) }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

const RING_RADIUS = 42;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Full circular progress ring, like the reference's humidity card. */
export function Ring({
  value,
  size = 72,
  color = 'var(--accent)',
  stroke = 10,
  children,
}: {
  value: number;
  size?: number;
  color?: string;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth={stroke} style={{ stroke: 'var(--track)' }} />
        <motion.circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          initial={false}
          animate={{ strokeDashoffset: RING_LENGTH * (1 - clamped / 100) }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ stroke: color, transition: 'stroke 0.5s ease' }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'muted';
  children: ReactNode;
}) {
  const styles = {
    ok: 'text-ok',
    warn: 'text-accent-ink',
    muted: 'text-muted',
  }[tone];
  const dot = { ok: 'bg-ok', warn: 'bg-accent', muted: 'bg-faint' }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${tone === 'ok' ? 'animate-pulse' : ''}`} />
      {children}
    </span>
  );
}

const SEGMENTS: Record<string, string> = {
  a: '5,1 19,1 21,3 19,5 5,5 3,3',
  b: '19,6 21,4 23,6 23,17 21,19 19,17',
  c: '19,23 21,21 23,23 23,34 21,36 19,34',
  d: '5,35 19,35 21,37 19,39 5,39 3,37',
  e: '1,23 3,21 5,23 5,34 3,36 1,34',
  f: '1,6 3,4 5,6 5,17 3,19 1,17',
  g: '5,18 19,18 21,20 19,22 5,22 3,20',
};

const DIGIT_SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
};

/** One seven-segment digit, mirroring the cooler's physical LED display. */
export function SevenSegmentDigit({ char, on = true }: { char: string; on?: boolean }) {
  const lit = on ? (DIGIT_SEGMENTS[char] ?? '') : '';
  return (
    <svg viewBox="0 0 24 40" className="h-full w-auto">
      {Object.entries(SEGMENTS).map(([segment, points]) => (
        <polygon
          key={segment}
          points={points}
          style={{
            fill: lit.includes(segment) ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            filter: lit.includes(segment) ? 'drop-shadow(0 0 3px var(--accent))' : undefined,
            transition: 'fill 0.3s ease',
          }}
        />
      ))}
    </svg>
  );
}
