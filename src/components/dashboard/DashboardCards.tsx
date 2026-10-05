import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, CalendarDays, Cpu, CircuitBoard, MonitorSmartphone, Thermometer } from 'lucide-react';
import { CardHeader, GlassCard, Ring, Segmented, SevenSegmentDigit, StatusChip, Toggle } from './ui';
import { formatTemp, toUnit, usePreferences } from './preferences';
import { getTempColor, tempToGauge } from './utils';
import { useCoolerDisplay } from './useCoolerDisplay';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

export function OverviewCard({
  cpuTemp,
  cpuModel,
  gpuModel,
  activeFans,
  totalFans,
}: {
  cpuTemp: number | null;
  cpuModel?: string;
  gpuModel?: string;
  activeFans: number;
  totalFans: number;
}) {
  const now = useClock();
  const { unit } = usePreferences();
  const date = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <GlassCard delay={0} className="flex flex-col justify-between">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted">
        <CalendarDays className="h-4 w-4" />
        <span className="first-letter:uppercase">{date}</span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <span className="text-[52px] font-bold leading-none tracking-tight tabular-nums text-ink">{time}</span>
        <span className="mb-1.5 flex items-start text-2xl font-semibold tabular-nums text-muted">
          {cpuTemp === null ? 'N/D' : Math.round(toUnit(cpuTemp, unit))}
          <span className="text-sm">°{unit}</span>
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-2xl bg-chip px-3 py-2.5">
          <p className="text-muted">Ventiladores</p>
          <p className="mt-0.5 text-base font-bold text-ink">
            {activeFans}
            <span className="text-xs font-semibold text-muted"> / {totalFans} activos</span>
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-chip px-3 py-2.5" title={[cpuModel, gpuModel].filter(Boolean).join(' · ')}>
          <p className="text-muted">Equipo</p>
          <p className="mt-0.5 truncate text-[13px] font-bold text-ink">{cpuModel ?? 'PC de escritorio'}</p>
        </div>
      </div>
    </GlassCard>
  );
}

function TempRing({ label, temp, icon }: { label: string; temp: number | null; icon: React.ReactNode }) {
  const { unit } = usePreferences();
  const color = temp === null ? null : getTempColor(temp);
  return (
    <div className="flex items-center gap-3">
      <Ring value={temp === null ? 0 : tempToGauge(temp)} color={color?.color ?? 'var(--faint)'} size={70}>
        <span className="text-muted">{icon}</span>
      </Ring>
      <div className="leading-tight">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="text-[26px] font-bold tabular-nums text-ink">{formatTemp(temp, unit, false)}</p>
        {color && <p className={`text-[11px] font-semibold ${color.text}`}>{color.label}</p>}
      </div>
    </div>
  );
}

export function TemperaturesCard({ cpuTemp, gpuTemp }: { cpuTemp: number | null; gpuTemp: number | null }) {
  return (
    <GlassCard delay={1}>
      <CardHeader icon={<Thermometer className="h-4 w-4" />} title="Temperaturas" subtitle="Procesador y gráfica" />
      <div className="flex flex-col gap-4">
        <TempRing label="CPU" temp={cpuTemp} icon={<Cpu className="h-5 w-5" />} />
        <TempRing label="GPU" temp={gpuTemp} icon={<CircuitBoard className="h-5 w-5" />} />
      </div>
    </GlassCard>
  );
}

export function HistoryCard({ history, className = '' }: { history: number[]; className?: string }) {
  const { unit } = usePreferences();
  const values = history.map((t) => toUnit(t, unit));
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const ceiling = Math.max(max + 5, min + 15);
  const floor = Math.max(0, min - 10);
  const current = values[values.length - 1];
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return (
    <GlassCard delay={2} className={`flex flex-col ${className}`}>
      <CardHeader
        icon={<Activity className="h-4 w-4" />}
        title="Historial de CPU"
        subtitle="Últimos minutos"
        action={
          <div className="text-right leading-tight">
            <p className="text-[28px] font-bold tabular-nums text-ink">
              {current === undefined ? '—' : `${Math.round(current)}°`}
            </p>
            <p className="text-[11px] text-muted">
              prom. {avg === null ? '—' : `${Math.round(avg)}°`} · máx. {values.length ? `${Math.round(max)}°` : '—'}
            </p>
          </div>
        }
      />
      <div className="flex min-h-[120px] flex-1 items-end gap-1.5">
        {values.length === 0 && <p className="m-auto text-xs text-muted">Reuniendo lecturas…</p>}
        {values.map((value, i) => {
          const isLast = i === values.length - 1;
          const height = ((value - floor) / (ceiling - floor)) * 100;
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5 pt-6">
              {isLast && (
                <span className="accent-gradient chip-shadow whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                  {Math.round(value)}°{unit}
                </span>
              )}
              <motion.div
                initial={false}
                animate={{ height: `${Math.max(6, Math.min(100, height))}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className={`w-full max-w-[14px] shrink rounded-full ${isLast ? 'accent-gradient' : 'bg-track'}`}
              />
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

export function CoolerDisplayCard({ cpuTemp, gpuTemp }: { cpuTemp: number | null; gpuTemp: number | null }) {
  const { supported, config, connected, update } = useCoolerDisplay();
  const temp = config.source === 'gpu' ? gpuTemp : cpuTemp;
  // The physical panel always shows Celsius, 0-99.
  const shown = temp === null ? '--' : String(Math.min(99, Math.max(0, Math.round(temp)))).padStart(2, ' ');
  // Dim the preview only when the panel is known to be off or unplugged.
  const lit = config.enabled && connected !== false;

  return (
    <GlassCard delay={3} className="flex flex-col">
      <CardHeader
        icon={<MonitorSmartphone className="h-4 w-4" />}
        title="Display del disipador"
        subtitle="Pantalla USB del cooler"
        action={
          supported ? (
            <StatusChip tone={connected ? 'ok' : 'muted'}>{connected ? 'Conectado' : 'No detectado'}</StatusChip>
          ) : (
            <StatusChip tone="muted">Solo escritorio</StatusChip>
          )
        }
      />

      <div className="relative mx-auto flex h-[104px] w-full max-w-[220px] items-center justify-center gap-2 rounded-[22px] bg-lcd px-6 py-4 shadow-[inset_0_2px_12px_rgba(0,0,0,0.6)]">
        <div className="flex h-full items-center gap-2">
          <SevenSegmentDigit char={shown[0]} on={lit} />
          <SevenSegmentDigit char={shown[1]} on={lit} />
        </div>
        <span
          className="absolute right-5 top-4 text-sm font-bold transition-colors"
          style={{ color: lit ? 'var(--accent)' : 'rgba(255,255,255,0.12)' }}
        >
          °C
        </span>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-ink">Mostrar temperatura</p>
          <Toggle
            label="Mostrar temperatura en el display"
            checked={config.enabled}
            disabled={!supported}
            onChange={(enabled) => update({ ...config, enabled })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-ink">Fuente</p>
          <Segmented
            size="sm"
            options={[
              { value: 'cpu', label: 'CPU' },
              { value: 'gpu', label: 'GPU' },
            ]}
            value={config.source}
            disabled={!supported || !config.enabled}
            onChange={(source) => update({ ...config, source })}
          />
        </div>
      </div>
    </GlassCard>
  );
}
