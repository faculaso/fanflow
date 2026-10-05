import { useState } from 'react';
import { Check, Minus, Pencil, Plus, X } from 'lucide-react';
import type { FanData, TempSource } from './types';
import { clamp, formatRpm, getFanIcon } from './utils';
import { ArcGauge, GlassCard, IconBadge, Segmented, Toggle } from './ui';

const TEMP_SOURCES = [
  { value: 'CPU', label: 'CPU' },
  { value: 'GPU', label: 'GPU' },
  { value: 'VRM', label: 'VRM' },
] as const;

const STEP = 5;

interface FanCardProps {
  fan: FanData;
  onChange: (updated: FanData) => void;
  index?: number;
}

export default function FanCard({ fan, onChange, index = 0 }: FanCardProps) {
  const Icon = getFanIcon(fan.name);
  const isAuto = fan.mode === 'Auto';
  const manualLocked = isAuto || !fan.controllable;
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(fan.name);

  function startEditingName() {
    setNameDraft(fan.name);
    setIsEditingName(true);
  }

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== fan.name) {
      onChange({ ...fan, name: trimmed });
    }
    setIsEditingName(false);
  }

  function setPwm(value: number) {
    const next = clamp(value, 0, 100);
    onChange({ ...fan, pwm: next, rpm: Math.round((next / 100) * fan.maxRpm) });
  }

  return (
    <GlassCard delay={index} className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge>
            <Icon className="h-4 w-4" />
          </IconBadge>
          <div className="min-w-0 leading-tight">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  value={nameDraft}
                  maxLength={40}
                  aria-label="Nombre del ventilador"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  onBlur={commitName}
                  className="field w-full min-w-0 py-1 text-sm font-semibold"
                />
                <button
                  type="button"
                  aria-label="Guardar nombre"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={commitName}
                  className="rounded-full p-1 text-ok hover:bg-chip"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Cancelar"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIsEditingName(false)}
                  className="rounded-full p-1 text-muted hover:bg-chip"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditingName}
                className="group flex max-w-full items-center gap-1.5 text-left"
                title="Cambiar nombre"
              >
                <span className="truncate text-[15px] font-semibold text-ink">{fan.name}</span>
                <Pencil className="h-3 w-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            {fan.category !== fan.name && (
              <span className="block truncate text-xs text-muted">{fan.category}</span>
            )}
          </div>
        </div>
        {!fan.controllable && (
          <span className="shrink-0 rounded-full bg-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Solo lectura
          </span>
        )}
      </div>

      <div className="relative mx-auto mt-3">
        <ArcGauge value={fan.pwm} size={156}>
          <span className="text-[32px] font-bold leading-none tabular-nums text-ink">
            {fan.pwm}
            <span className="text-lg text-muted">%</span>
          </span>
          <span className="mt-1.5 text-[11px] font-medium text-muted">
            {fan.rpm > 0 ? formatRpm(fan.rpm) : 'Pasivo'}
          </span>
        </ArcGauge>
        <span className="absolute bottom-3 left-2 text-[11px] font-semibold text-faint">0</span>
        <span className="absolute bottom-3 right-0 text-[11px] font-semibold text-faint">100</span>
      </div>

      {fan.controllable && (
        <>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              aria-label="Bajar velocidad"
              disabled={manualLocked || fan.pwm <= 0}
              onClick={() => setPwm(fan.pwm - STEP)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-chip disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={fan.pwm}
              aria-label="Velocidad manual"
              disabled={manualLocked}
              onChange={(e) => setPwm(Number(e.target.value))}
              style={{ '--value': fan.pwm } as React.CSSProperties}
              className="range flex-1"
            />
            <button
              type="button"
              aria-label="Subir velocidad"
              disabled={manualLocked || fan.pwm >= 100}
              onClick={() => setPwm(fan.pwm + STEP)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-chip disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-ink">Curva automática</p>
              <p className="text-[11px] text-muted">{isAuto ? 'Sigue la temperatura' : 'Velocidad fija'}</p>
            </div>
            <Toggle
              label="Curva automática"
              checked={isAuto}
              onChange={(auto) => onChange({ ...fan, mode: auto ? 'Auto' : 'Manual' })}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Sensor</span>
            <Segmented
              size="sm"
              options={TEMP_SOURCES}
              value={fan.tempSource}
              onChange={(source: TempSource) => onChange({ ...fan, tempSource: source })}
            />
          </div>
        </>
      )}
    </GlassCard>
  );
}
