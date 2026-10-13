import { Cpu, CircuitBoard, Moon, Sun, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { DashboardView } from './types';
import { getTempColor } from './utils';
import { formatTemp, setPreferences, usePreferences } from './preferences';
import { StatusChip } from './ui';

const TITLES: Record<DashboardView, { title: string; subtitle: string }> = {
  dashboard: { title: 'Panel', subtitle: 'Estado de la refrigeración en tiempo real' },
  curves: { title: 'Curvas de ventilación', subtitle: 'Cómo responde cada ventilador a la temperatura' },
  sensors: { title: 'Sensores', subtitle: 'Hardware detectado y lecturas en vivo' },
  memory: { title: 'Memoria', subtitle: 'Uso de RAM y liberación de memoria' },
  settings: { title: 'Ajustes', subtitle: 'Preferencias de FanFlow' },
};

interface HeaderStatusProps {
  view: DashboardView;
  cpuTemp: number | null;
  gpuTemp: number | null;
  noiseDb: number;
  cpuModel?: string;
  gpuModel?: string;
  dataSource: 'real' | 'simulado';
}

function TempChip({
  icon,
  label,
  temp,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  temp: number | null;
  title?: string;
}) {
  const { unit } = usePreferences();
  const color = temp === null ? 'var(--faint)' : getTempColor(temp).color;
  return (
    <div title={title} className="glass flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors duration-500"
        style={{ backgroundColor: color }}
      >
        {icon}
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="mt-1 text-sm font-bold tabular-nums text-ink">{formatTemp(temp, unit)}</span>
      </div>
    </div>
  );
}

function ThemeSwitch() {
  const { theme } = usePreferences();
  const options = [
    { value: 'light' as const, label: 'Claro', icon: Sun },
    { value: 'dark' as const, label: 'Oscuro', icon: Moon },
  ];
  return (
    <div className="glass flex items-center rounded-full p-1">
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setPreferences({ theme: value })}
            className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {active && (
              <motion.span
                layoutId="theme-active"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className="chip-shadow absolute inset-0 rounded-full bg-chip-active"
              />
            )}
            <Icon className={`relative h-3.5 w-3.5 ${active ? 'text-accent' : ''}`} />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function HeaderStatus({
  view,
  cpuTemp,
  gpuTemp,
  noiseDb,
  cpuModel,
  gpuModel,
  dataSource,
}: HeaderStatusProps) {
  const { title, subtitle } = TITLES[view];

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-bold tracking-tight text-ink">{title}</h1>
          <StatusChip tone={dataSource === 'real' ? 'ok' : 'warn'}>
            {dataSource === 'real' ? 'Hardware real' : 'Simulado'}
          </StatusChip>
        </div>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <TempChip icon={<Cpu className="h-4 w-4" />} label="CPU" temp={cpuTemp} title={cpuModel} />
        <TempChip icon={<CircuitBoard className="h-4 w-4" />} label="GPU" temp={gpuTemp} title={gpuModel} />
        <div className="glass flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4" title="Ruido estimado">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip-active text-muted">
            <Volume2 className="h-4 w-4" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ruido</span>
            <span className="mt-1 text-sm font-bold tabular-nums text-ink">{noiseDb.toFixed(0)} dB</span>
          </div>
        </div>
        <ThemeSwitch />
      </div>
    </header>
  );
}
