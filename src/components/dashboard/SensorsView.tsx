import { useState } from 'react';
import { ClipboardCopy, Cpu, CircuitBoard, Fan, HardDrive, Thermometer } from 'lucide-react';
import type { FanData, HardwareInfo, HardwareStatus, SensorReading } from './types';
import { formatRpm, getTempColor, tempToGauge } from './utils';
import { CardHeader, GlassCard, IconBadge, Ring, StatusChip } from './ui';
import { formatTemp, usePreferences } from './preferences';

interface SensorsViewProps {
  sensors: SensorReading[];
  fans: FanData[];
  hardware: HardwareInfo | null;
  hardwareStatus: 'unsupported' | 'loading' | 'ready' | 'error';
  liveStatus: HardwareStatus | null;
  liveSupported: boolean;
  usingRealHardware: boolean;
}

function liveStatusMessage(
  liveSupported: boolean,
  usingRealHardware: boolean,
  liveStatus: HardwareStatus | null,
): { text: string; tone: 'ok' | 'warn' | 'muted' } | null {
  if (!liveSupported) return null;
  if (usingRealHardware) {
    return { text: 'Sensores y control de ventiladores reales activos.', tone: 'ok' };
  }
  if (!liveStatus) {
    return { text: 'Conectando con el sensor de hardware…', tone: 'muted' };
  }
  if (liveStatus.error === 'helper-missing') {
    return { text: 'No se encontró el componente de sensores de hardware.', tone: 'warn' };
  }
  if (liveStatus.error === 'helper-spawn-failed') {
    return {
      text: 'No se pudo iniciar el sensor de hardware. Cerrá FanFlow y abrilo de nuevo aceptando el permiso de Administrador.',
      tone: 'warn',
    };
  }
  if (liveStatus.error === 'helper-exited') {
    return { text: 'El proceso de sensores se cerró inesperadamente. Reiniciá FanFlow.', tone: 'warn' };
  }
  if (!liveStatus.admin) {
    return {
      text: 'Ejecutá FanFlow como Administrador para lecturas y control de ventiladores reales.',
      tone: 'warn',
    };
  }
  return { text: 'No se pudo acceder a los sensores de hardware.', tone: 'warn' };
}

function formatVram(vram: number | null): string {
  if (!vram) return '';
  return vram >= 1024 ? `${(vram / 1024).toFixed(0)} GB VRAM` : `${vram} MB VRAM`;
}

function HardwareTile({
  icon,
  label,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-chip p-4">
      <IconBadge className="h-11 w-11">{icon}</IconBadge>
      <div className="min-w-0 leading-tight">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-ink">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function SensorsView({
  sensors,
  fans,
  hardware,
  hardwareStatus,
  liveStatus,
  liveSupported,
  usingRealHardware,
}: SensorsViewProps) {
  const { unit } = usePreferences();
  const liveMessage = liveStatusMessage(liveSupported, usingRealHardware, liveStatus);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'empty' | 'error'>('idle');

  async function handleCopyDiagnostics() {
    try {
      const copied = await window.hardware?.copyDiagnostics();
      setCopyState(copied ? 'copied' : 'empty');
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 2500);
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassCard delay={0}>
        <CardHeader
          icon={<HardDrive className="h-4 w-4" />}
          title="Hardware detectado"
          subtitle={liveMessage ? undefined : 'Información del sistema'}
          action={
            liveSupported && (
              <button
                type="button"
                onClick={handleCopyDiagnostics}
                className="flex items-center gap-1.5 rounded-full bg-chip px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-chip-active"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                {copyState === 'copied'
                  ? 'Copiado'
                  : copyState === 'empty'
                    ? 'Sin datos aún'
                    : copyState === 'error'
                      ? 'No se pudo copiar'
                      : 'Copiar diagnóstico'}
              </button>
            )
          }
        />

        {liveMessage && (
          <div className="mb-4">
            <StatusChip tone={liveMessage.tone}>{liveMessage.text}</StatusChip>
          </div>
        )}

        {hardwareStatus === 'unsupported' && (
          <p className="text-sm text-muted">
            La detección de hardware solo está disponible en la app de escritorio. Abrí FanFlow instalado (no en
            el navegador) para ver tu procesador y placa de video reales.
          </p>
        )}
        {hardwareStatus === 'loading' && <p className="text-sm text-muted">Detectando hardware…</p>}
        {hardwareStatus === 'error' && (
          <p className="text-sm text-hot">No se pudo leer la información de hardware.</p>
        )}
        {hardwareStatus === 'ready' && hardware && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <HardwareTile
              icon={<Cpu className="h-5 w-5" />}
              label="Procesador"
              title={hardware.cpu.brand || hardware.cpu.manufacturer}
              subtitle={`${hardware.cpu.physicalCores} núcleos · ${hardware.cpu.cores} hilos · ${hardware.cpu.speed} GHz`}
            />
            {hardware.gpus.length > 0 ? (
              hardware.gpus.map((gpu, i) => (
                <HardwareTile
                  key={`${gpu.model}-${i}`}
                  icon={<CircuitBoard className="h-5 w-5" />}
                  label={hardware.gpus.length > 1 ? `Gráfica ${i + 1}` : 'Gráfica'}
                  title={gpu.model}
                  subtitle={[gpu.vendor, formatVram(gpu.vram)].filter(Boolean).join(' · ')}
                />
              ))
            ) : (
              <HardwareTile icon={<CircuitBoard className="h-5 w-5" />} label="Gráfica" title="No detectada" />
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard delay={1}>
        <CardHeader
          icon={<Thermometer className="h-4 w-4" />}
          title="Sensores de temperatura"
          subtitle={`${sensors.length} lecturas`}
        />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {sensors.map((sensor) => {
            const color = getTempColor(sensor.value);
            return (
              <div key={sensor.id} className="flex items-center gap-3 rounded-2xl bg-chip p-3">
                <Ring value={tempToGauge(sensor.value)} color={color.color} size={52} stroke={11} />
                <div className="min-w-0 leading-tight">
                  <p className="text-xl font-bold tabular-nums text-ink">{formatTemp(sensor.value, unit)}</p>
                  <p className="truncate text-xs text-muted" title={sensor.label}>
                    {sensor.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard delay={2}>
        <CardHeader icon={<Fan className="h-4 w-4" />} title="Ventiladores detectados" subtitle={`${fans.length} canales`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-faint">
                <th className="px-3 pb-2 font-semibold">Nombre</th>
                <th className="px-3 pb-2 font-semibold">Velocidad</th>
                <th className="px-3 pb-2 font-semibold">PWM</th>
                <th className="px-3 pb-2 font-semibold">Modo</th>
                <th className="px-3 pb-2 font-semibold">Sensor</th>
              </tr>
            </thead>
            <tbody>
              {fans.map((fan) => (
                <tr key={fan.id} className="border-t border-line">
                  <td className="px-3 py-3 font-semibold text-ink">{fan.name}</td>
                  <td className="px-3 py-3 tabular-nums text-muted">{formatRpm(fan.rpm)}</td>
                  <td className="px-3 py-3">
                    {fan.controllable ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-track">
                          <div className="accent-gradient h-full rounded-full" style={{ width: `${fan.pwm}%` }} />
                        </div>
                        <span className="tabular-nums text-ink">{fan.pwm}%</span>
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {fan.controllable ? (fan.mode === 'Auto' ? 'Curva' : 'Manual') : 'Solo lectura'}
                  </td>
                  <td className="px-3 py-3 text-muted">{fan.controllable ? fan.tempSource : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
