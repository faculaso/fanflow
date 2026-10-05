import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw, SlidersHorizontal, Timer, Waves, X } from 'lucide-react';
import type { CurvePoint, FanData } from './types';
import { clamp, getSourceTemp, interpolateCurve } from './utils';
import { CardHeader, GlassCard, Segmented } from './ui';
import { toUnit, usePreferences } from './preferences';

const TEMP_MIN = 20;
const TEMP_MAX = 90;
const MIN_GAP = 3;
const MAX_POINTS = 7;

const CHART_MARGIN = { top: 16, right: 20, left: 0, bottom: 0 };
const Y_AXIS_WIDTH = 40;
const X_AXIS_HEIGHT = 26;

interface FanCurveEditorProps {
  fans: FanData[];
  selectedFanId: string;
  onSelectFan: (id: string) => void;
  onChange: (updated: FanData) => void;
  cpuTemp: number | null;
  gpuTemp: number | null;
}

function sortCurve(points: CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a.temp - b.temp);
}

/** Recharts takes literal colours, so resolve the theme tokens whenever the theme flips. */
function useThemeColors(theme: string) {
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
      accent: read('--accent'),
      accent2: read('--accent-2'),
      muted: read('--muted'),
      line: read('--line'),
      ink: read('--ink'),
      surface: read('--chip-active'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}

export default function FanCurveEditor({
  fans,
  selectedFanId,
  onSelectFan,
  onChange,
  cpuTemp,
  gpuTemp,
}: FanCurveEditorProps) {
  const fan = fans.find((f) => f.id === selectedFanId) ?? fans[0];
  const { unit, theme } = usePreferences();
  const colors = useThemeColors(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const liveTemp =
    cpuTemp === null && gpuTemp === null
      ? null
      : getSourceTemp(fan.tempSource, cpuTemp ?? gpuTemp ?? 0, gpuTemp ?? cpuTemp ?? 0);
  const liveSpeed = liveTemp === null ? null : interpolateCurve(fan.curve, liveTemp);

  const updateCurve = useCallback(
    (curve: CurvePoint[]) => {
      onChange({ ...fan, curve: sortCurve(curve) });
    },
    [fan, onChange],
  );

  const pixelToPoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const plotWidth = rect.width - CHART_MARGIN.left - CHART_MARGIN.right - Y_AXIS_WIDTH;
    const plotHeight = rect.height - CHART_MARGIN.top - CHART_MARGIN.bottom - X_AXIS_HEIGHT;
    const x = clientX - rect.left - CHART_MARGIN.left - Y_AXIS_WIDTH;
    const y = clientY - rect.top - CHART_MARGIN.top;
    const tempRatio = clamp(x / plotWidth, 0, 1);
    const speedRatio = clamp(1 - y / plotHeight, 0, 1);
    return {
      temp: Math.round(TEMP_MIN + tempRatio * (TEMP_MAX - TEMP_MIN)),
      speed: Math.round(speedRatio * 100),
    };
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const index = draggingIndex.current;
      if (index === null) return;
      const next = pixelToPoint(event.clientX, event.clientY);
      if (!next) return;

      const points = [...fan.curve];
      const prevPoint = points[index - 1];
      const nextPoint = points[index + 1];
      const minTemp = prevPoint ? prevPoint.temp + MIN_GAP : TEMP_MIN;
      const maxTemp = nextPoint ? nextPoint.temp - MIN_GAP : TEMP_MAX;

      points[index] = {
        temp: clamp(next.temp, minTemp, maxTemp),
        speed: clamp(next.speed, 0, 100),
      };
      onChange({ ...fan, curve: points });
    },
    [fan, onChange, pixelToPoint],
  );

  const stopDragging = useCallback(() => {
    draggingIndex.current = null;
    setActiveIndex(null);
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', stopDragging);
  }, [handlePointerMove]);

  const startDragging = useCallback(
    (index: number) => (event: React.PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      draggingIndex.current = index;
      setActiveIndex(index);
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', stopDragging);
    },
    [handlePointerMove, stopDragging],
  );

  function handleAddPoint(event: React.MouseEvent) {
    if (fan.curve.length >= MAX_POINTS) return;
    const next = pixelToPoint(event.clientX, event.clientY);
    if (!next) return;
    const tooClose = fan.curve.some((p) => Math.abs(p.temp - next.temp) < MIN_GAP);
    if (tooClose) return;
    updateCurve([...fan.curve, { temp: next.temp, speed: next.speed }]);
  }

  function handleRemovePoint(index: number) {
    if (fan.curve.length <= 2) return;
    updateCurve(fan.curve.filter((_, i) => i !== index));
  }

  function handleReset() {
    updateCurve([
      { temp: 30, speed: 20 },
      { temp: 50, speed: 35 },
      { temp: 65, speed: 60 },
      { temp: 80, speed: 100 },
    ]);
  }

  const formatTempTick = (value: number) => `${Math.round(toUnit(value, unit))}°`;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
      <GlassCard delay={0}>
        <CardHeader
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title={fan.name}
          subtitle="Arrastrá los puntos · doble clic para agregar uno"
          action={
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-full bg-chip px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-chip-active"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </button>
          }
        />

        {fans.length > 1 && (
          <Segmented
            size="sm"
            className="mb-4"
            options={fans.map((f) => ({ value: f.id, label: f.name }))}
            value={fan.id}
            onChange={onSelectFan}
          />
        )}

        <div
          ref={containerRef}
          onDoubleClick={handleAddPoint}
          className="relative h-[320px] w-full select-none rounded-[20px] bg-chip p-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fan.curve} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="curve-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.accent} />
                  <stop offset="100%" stopColor={colors.accent2} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.line} vertical={false} />
              <XAxis
                dataKey="temp"
                type="number"
                domain={[TEMP_MIN, TEMP_MAX]}
                height={X_AXIS_HEIGHT}
                tick={{ fill: colors.muted, fontSize: 11 }}
                tickFormatter={formatTempTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="speed"
                type="number"
                domain={[0, 100]}
                width={Y_AXIS_WIDTH}
                tick={{ fill: colors.muted, fontSize: 11 }}
                unit="%"
                axisLine={false}
                tickLine={false}
              />
              {liveTemp !== null && (
                <ReferenceLine
                  x={clamp(liveTemp, TEMP_MIN, TEMP_MAX)}
                  stroke={colors.muted}
                  strokeDasharray="4 4"
                  label={{
                    value: `Ahora ${Math.round(toUnit(liveTemp, unit))}°`,
                    position: 'insideTopRight',
                    fill: colors.muted,
                    fontSize: 11,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="speed"
                fill="url(#curve-fill)"
                stroke="none"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="url(#curve-stroke)"
                strokeWidth={3}
                isAnimationActive={false}
                dot={(dotProps) => {
                  const { cx, cy, index } = dotProps;
                  const isActive = index === activeIndex;
                  return (
                    <g key={`dot-${index}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isActive ? 10 : 8}
                        fill={colors.surface}
                        stroke={colors.accent}
                        strokeWidth={4}
                        className="cursor-grab"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                        onPointerDown={startDragging(index as number)}
                        onDoubleClick={(e) => e.stopPropagation()}
                      />
                    </g>
                  );
                }}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {fan.curve.map((point, index) => (
            <span
              key={`${point.temp}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-chip py-1.5 pl-3 pr-1.5 text-xs font-semibold tabular-nums text-ink"
            >
              {Math.round(toUnit(point.temp, unit))}°{unit}
              <span className="text-faint">→</span>
              {point.speed}%
              {fan.curve.length > 2 && (
                <button
                  type="button"
                  aria-label="Quitar punto"
                  onClick={() => handleRemovePoint(index)}
                  className="rounded-full p-0.5 text-muted transition-colors hover:bg-hot/15 hover:text-hot"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </GlassCard>

      <div className="flex flex-col gap-5">
        <GlassCard delay={1}>
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Ahora</p>
          <p className="mt-2 text-[44px] font-bold leading-none tabular-nums text-ink">
            {liveSpeed === null ? '—' : liveSpeed}
            <span className="text-xl text-muted">%</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            {liveTemp === null
              ? 'Sin lectura de temperatura'
              : `a ${Math.round(toUnit(liveTemp, unit))}°${unit} de ${fan.tempSource}`}
          </p>
          <p className="mt-3 rounded-2xl bg-chip px-3 py-2 text-xs text-muted">
            {fan.mode === 'Auto'
              ? 'Este ventilador sigue la curva.'
              : 'Está en modo manual: la curva se aplica al activar "Curva automática".'}
          </p>
        </GlassCard>

        <GlassCard delay={2} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
            <span className="flex items-center gap-1.5">
              <Waves className="h-3.5 w-3.5" /> Histéresis (°C)
            </span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={fan.hysteresis}
              onChange={(e) => onChange({ ...fan, hysteresis: Number(e.target.value) })}
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
            <span className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" /> Tiempo de respuesta (s)
            </span>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={fan.responseTime}
              onChange={(e) => onChange({ ...fan, responseTime: Number(e.target.value) })}
              className="field"
            />
          </label>
        </GlassCard>
      </div>
    </div>
  );
}
