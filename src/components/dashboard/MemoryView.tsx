import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, MemoryStick, Sparkles, Timer, Wand2 } from 'lucide-react';
import type { MemoryOperation } from './types';
import type { MemoryCleaner } from './useMemoryCleaner';
import { ArcGauge, CardHeader, GlassCard, Segmented, Toggle } from './ui';

const OPERATIONS: { id: MemoryOperation; label: string; description: string }[] = [
  {
    id: 'workingSets',
    label: 'Vaciar working sets',
    description:
      'Saca de la RAM las páginas inactivas de todos los procesos. Es lo que más libera; las apps pueden tardar un instante al volver a usarse.',
  },
  {
    id: 'modified',
    label: 'Lista modificada',
    description: 'Escribe a disco las páginas pendientes y las pasa a la lista en espera.',
  },
  {
    id: 'standby',
    label: 'Lista en espera completa',
    description: 'Descarta toda la caché en memoria y la deja libre. Windows la vuelve a llenar con el uso.',
  },
  {
    id: 'lowStandby',
    label: 'Lista en espera (baja prioridad)',
    description: 'Descarta solo la caché menos importante. Más suave que la anterior.',
  },
  {
    id: 'fileCache',
    label: 'Caché de archivos del sistema',
    description: 'Recorta la caché de archivos de Windows.',
  },
];

const THRESHOLDS = [75, 80, 85, 90].map((v) => ({ value: String(v), label: `${v}%` }));

function formatGb(bytes: number, digits = 1): string {
  return `${(bytes / 1024 ** 3).toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} GB`;
}

function formatAmount(bytes: number): string {
  return bytes >= 1024 ** 3 ? formatGb(bytes) : `${Math.round(bytes / 1024 ** 2)} MB`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function timeAgo(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'recién';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

export default function MemoryView({ memory }: { memory: MemoryCleaner }) {
  const { stats, settings, updateSettings, clean, cleaning, lastClean } = memory;
  const now = useNow(15_000);

  if (!stats) {
    return (
      <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
        <MemoryStick className="h-8 w-8 text-faint" />
        <p className="text-sm text-muted">Esperando lecturas de memoria del sensor de hardware…</p>
      </GlassCard>
    );
  }

  const used = stats.total - stats.available;
  const hasBreakdown = stats.standby !== undefined && stats.free !== undefined;
  const modified = stats.modified ?? 0;
  const segments = hasBreakdown
    ? [
        { label: 'En uso', value: Math.max(0, used - modified), color: 'var(--accent)' },
        { label: 'Modificada', value: modified, color: 'var(--accent-2)' },
        { label: 'En espera (caché)', value: stats.standby ?? 0, color: 'var(--cool)' },
        { label: 'Libre', value: stats.free ?? 0, color: 'var(--track)' },
      ]
    : [
        { label: 'En uso', value: used, color: 'var(--accent)' },
        { label: 'Disponible', value: stats.available, color: 'var(--track)' },
      ];

  function toggleOperation(op: MemoryOperation, enabled: boolean) {
    const next = enabled ? [...settings.operations, op] : settings.operations.filter((o) => o !== op);
    updateSettings({ operations: OPERATIONS.map((o) => o.id).filter((id) => next.includes(id)) });
  }

  const failed = lastClean?.results.filter((r) => !r.ok) ?? [];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <GlassCard delay={0} className="flex flex-col items-center">
        <div className="w-full">
          <CardHeader
            icon={<MemoryStick className="h-4 w-4" />}
            title="Memoria RAM"
            subtitle={`${formatGb(stats.total, 0)} instalados`}
          />
        </div>
        <ArcGauge value={stats.load} size={190}>
          <span className="text-[40px] font-bold leading-none tabular-nums text-ink">
            {stats.load}
            <span className="text-xl text-muted">%</span>
          </span>
          <span className="mt-2 text-xs font-medium text-muted">en uso</span>
        </ArcGauge>
        <div className="mt-2 grid w-full grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl bg-chip px-3 py-2.5">
            <p className="text-muted">En uso</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-ink">{formatGb(used)}</p>
          </div>
          <div className="rounded-2xl bg-chip px-3 py-2.5">
            <p className="text-muted">Disponible</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-ink">{formatGb(stats.available)}</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard delay={1} className="flex flex-col xl:col-span-2">
        <CardHeader
          icon={<Sparkles className="h-4 w-4" />}
          title="Liberar memoria"
          subtitle="Libera la RAM ocupada por procesos inactivos y caché"
        />

        <div className="flex flex-wrap items-center gap-5">
          <motion.button
            type="button"
            whileHover={{ scale: cleaning ? 1 : 1.03 }}
            whileTap={{ scale: 0.97 }}
            disabled={cleaning || settings.operations.length === 0}
            onClick={() => clean(settings.operations)}
            className="accent-gradient chip-shadow flex h-14 items-center gap-2.5 rounded-full px-8 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cleaning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
            {cleaning ? 'Liberando…' : 'Liberar memoria'}
          </motion.button>

          <div className="min-w-0 flex-1 leading-tight">
            {lastClean ? (
              lastClean.ok ? (
                <>
                  <p className="text-[22px] font-bold tabular-nums text-ink">
                    {formatAmount(lastClean.freed)} <span className="text-sm font-semibold text-muted">liberados</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {lastClean.automatic ? 'Limpieza automática' : 'Limpieza manual'} · {timeAgo(lastClean.at, now)}
                    {failed.length > 0 &&
                      ` · ${failed.length} ${failed.length === 1 ? 'operación falló' : 'operaciones fallaron'}`}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-hot">
                  No se pudo liberar memoria
                  {lastClean.error === 'helper-unavailable' ? ': el sensor de hardware no está corriendo.' : '.'}
                </p>
              )
            ) : (
              <p className="text-sm text-muted">
                {settings.operations.length === 0
                  ? 'Elegí al menos una operación abajo.'
                  : `Va a ejecutar ${settings.operations.length} ${settings.operations.length === 1 ? 'operación' : 'operaciones'}.`}
              </p>
            )}
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-track">
            {segments.map((segment) => (
              <motion.div
                key={segment.label}
                initial={false}
                animate={{ width: `${(segment.value / stats.total) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full"
                style={{ background: segment.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-line"
                  style={{ background: segment.color }}
                />
                <span className="text-muted">{segment.label}</span>
                <span className="font-bold tabular-nums text-ink">{formatGb(segment.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard delay={2} className="xl:col-span-2">
        <CardHeader
          icon={<Check className="h-4 w-4" />}
          title="Qué libera el botón"
          subtitle="También lo usa la limpieza automática"
        />
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {OPERATIONS.map((op) => (
            <div key={op.id} className="flex items-start justify-between gap-4 rounded-2xl bg-chip px-4 py-3.5">
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-semibold text-ink">{op.label}</p>
                <p className="mt-1 text-xs text-muted">{op.description}</p>
              </div>
              <Toggle
                label={op.label}
                checked={settings.operations.includes(op.id)}
                onChange={(enabled) => toggleOperation(op.id, enabled)}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard delay={3} className="flex flex-col">
        <CardHeader
          icon={<Timer className="h-4 w-4" />}
          title="Limpieza automática"
          subtitle="Cuando la RAM se llena"
          action={
            <Toggle
              label="Limpieza automática"
              checked={settings.autoEnabled}
              onChange={(autoEnabled) => updateSettings({ autoEnabled })}
            />
          }
        />
        <p className="text-sm text-muted">Liberar memoria cuando el uso llegue a:</p>
        <Segmented
          className="mt-3"
          options={THRESHOLDS}
          value={String(settings.autoThreshold)}
          disabled={!settings.autoEnabled}
          onChange={(value) => updateSettings({ autoThreshold: Number(value) })}
        />
        <div className="mt-auto pt-4">
          <p className="rounded-2xl bg-chip px-3 py-2.5 text-xs text-muted">
            Como mucho una vez cada 5 minutos, para no pelear con Windows mientras vuelve a llenar la caché.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
