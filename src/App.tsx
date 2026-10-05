import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Fan } from 'lucide-react';
import {
  CoolerDisplayCard,
  FanCard,
  FanCurveEditor,
  GlassCard,
  HeaderStatus,
  HistoryCard,
  MemoryView,
  OverviewCard,
  ProfileBar,
  SensorsView,
  Sidebar,
  SettingsView,
  TemperaturesCard,
  clamp,
  formatTemp,
  useMemoryCleaner,
  usePreferences,
  getSourceTemp,
  interpolateCurve,
  useHardwareInfo,
  useLiveHardware,
  type CurvePoint,
  type DashboardView,
  type FanData,
  type FanMode,
  type ProfileId,
  type SensorReading,
  type TempSource,
} from './components/dashboard';

interface FanIdentity {
  id: string;
  name: string;
  category: string;
  maxRpm: number;
  controllable: boolean;
}

const MOCK_FAN_IDENTITIES: FanIdentity[] = [
  { id: 'aio-pump', name: 'CPU Cooler / AIO Pump', category: 'AIO Pump', maxRpm: 2400, controllable: true },
  { id: 'intake-front', name: 'Ventiladores Frontales', category: 'Intake', maxRpm: 1800, controllable: true },
  { id: 'exhaust-rear', name: 'Ventilador Trasero', category: 'Exhaust', maxRpm: 1800, controllable: true },
  { id: 'gpu-fans', name: 'Ventiladores GPU', category: 'GPU', maxRpm: 2600, controllable: true },
];

interface FanConfig {
  mode: FanMode;
  tempSource: TempSource;
  curve: CurvePoint[];
  hysteresis: number;
  responseTime: number;
  manualPercent: number;
  customName: string | null;
}

const FAN_CONFIGS_STORAGE_KEY = 'fanflow:fanConfigs';

function loadStoredFanConfigs(): Record<string, FanConfig> {
  try {
    const raw = localStorage.getItem(FAN_CONFIGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function defaultCurveFor(category: string): CurvePoint[] {
  switch (category) {
    case 'AIO Pump':
      return [
        { temp: 30, speed: 20 },
        { temp: 50, speed: 35 },
        { temp: 65, speed: 60 },
        { temp: 80, speed: 100 },
      ];
    case 'Intake':
      return [
        { temp: 30, speed: 15 },
        { temp: 50, speed: 30 },
        { temp: 65, speed: 50 },
        { temp: 80, speed: 90 },
      ];
    case 'Exhaust':
      return [
        { temp: 30, speed: 18 },
        { temp: 50, speed: 32 },
        { temp: 65, speed: 55 },
        { temp: 80, speed: 95 },
      ];
    case 'GPU':
      return [
        { temp: 40, speed: 0 },
        { temp: 55, speed: 25 },
        { temp: 70, speed: 60 },
        { temp: 85, speed: 100 },
      ];
    default:
      return [
        { temp: 30, speed: 20 },
        { temp: 50, speed: 35 },
        { temp: 65, speed: 60 },
        { temp: 80, speed: 100 },
      ];
  }
}

function defaultConfig(category: string): FanConfig {
  return {
    mode: 'Auto',
    tempSource: 'CPU',
    curve: defaultCurveFor(category),
    hysteresis: 2,
    responseTime: 3,
    manualPercent: 40,
    customName: null,
  };
}

function computeDesiredPercent(
  config: FanConfig,
  cpuTemp: number | null,
  gpuTemp: number | null,
): number {
  const sourceTemp = getSourceTemp(config.tempSource, cpuTemp ?? FALLBACK_TEMP, gpuTemp ?? FALLBACK_TEMP);
  return config.mode === 'Auto' ? interpolateCurve(config.curve, sourceTemp) : config.manualPercent;
}

const CATEGORY_PROFILE_PRESETS: Record<ProfileId, Record<string, number>> = {
  silent: { 'AIO Pump': 30, Intake: 20, Exhaust: 25, GPU: 0 },
  balanced: { 'AIO Pump': 45, Intake: 30, Exhaust: 35, GPU: 20 },
  performance: { 'AIO Pump': 70, Intake: 55, Exhaust: 60, GPU: 50 },
  gaming: { 'AIO Pump': 85, Intake: 70, Exhaust: 75, GPU: 65 },
};
const PROFILE_DEFAULT_PERCENT: Record<ProfileId, number> = {
  silent: 25,
  balanced: 40,
  performance: 65,
  gaming: 85,
};
function getProfilePercent(profile: ProfileId, category: string): number {
  return CATEGORY_PROFILE_PRESETS[profile][category] ?? PROFILE_DEFAULT_PERCENT[profile];
}

/** Used only for curve math when a real sensor read is momentarily unavailable. */
const FALLBACK_TEMP = 45;

const HISTORY_LENGTH = 24;
const HISTORY_INTERVAL_MS = 5000;
const CRITICAL_TEMP = 80;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/** Samples the latest CPU temperature at a fixed pace for the history chart. */
function useTempHistory(temp: number | null): number[] {
  const latest = useRef(temp);
  const [history, setHistory] = useState<number[]>(() => (temp === null ? [] : [temp]));

  useEffect(() => {
    latest.current = temp;
  }, [temp]);

  useEffect(() => {
    const interval = setInterval(() => {
      const value = latest.current;
      if (value === null) return;
      setHistory((prev) => [...prev, value].slice(-HISTORY_LENGTH));
    }, HISTORY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // First real reading arrives after mount; seed so the chart isn't empty for 5 s.
  useEffect(() => {
    if (temp !== null) setHistory((prev) => (prev.length === 0 ? [temp] : prev));
  }, [temp]);

  return history;
}

export default function App() {
  const [view, setView] = useState<DashboardView>('dashboard');
  const [selectedFanId, setSelectedFanId] = useState(MOCK_FAN_IDENTITIES[0].id);
  const [profile, setProfile] = useState<ProfileId>('balanced');
  const [fanConfigs, setFanConfigs] = useState<Record<string, FanConfig>>(() => {
    const stored = loadStoredFanConfigs();
    const initial: Record<string, FanConfig> = {};
    for (const identity of MOCK_FAN_IDENTITIES) {
      initial[identity.id] = { ...defaultConfig(identity.category), ...stored[identity.id] };
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAN_CONFIGS_STORAGE_KEY, JSON.stringify(fanConfigs));
    } catch {
      // storage unavailable/full; custom names just won't persist
    }
  }, [fanConfigs]);

  const { data: hardwareInfo, status: hardwareInfoStatus } = useHardwareInfo();
  const live = useLiveHardware();
  const { setFanPercent: setLiveFanPercent, setFanAuto: setLiveFanAuto } = live;
  const usingRealHardware = live.supported && live.status?.ok === true;

  const [mockCpuTemp, setMockCpuTemp] = useState(52);
  const [mockGpuTemp, setMockGpuTemp] = useState(47);
  useEffect(() => {
    if (usingRealHardware) return;
    const interval = setInterval(() => {
      setMockCpuTemp((t) => clamp(t + (Math.random() - 0.5) * 3, 35, 78));
      setMockGpuTemp((t) => clamp(t + (Math.random() - 0.5) * 3, 32, 75));
    }, 2200);
    return () => clearInterval(interval);
  }, [usingRealHardware]);

  const cpuTemp = usingRealHardware ? (live.data?.cpu.temp ?? null) : mockCpuTemp;
  const gpuTemp = usingRealHardware ? (live.data?.gpu.temp ?? null) : mockGpuTemp;
  const cpuHistory = useTempHistory(cpuTemp);
  // Lives here (not in MemoryView) so automatic cleaning keeps running on every tab.
  const memory = useMemoryCleaner(live.data?.memory, usingRealHardware);
  const prefs = usePreferences();

  const fanIdentities: FanIdentity[] =
    usingRealHardware && live.data
      ? live.data.fans.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.name,
          maxRpm: 3000,
          controllable: f.controllable,
        }))
      : MOCK_FAN_IDENTITIES;

  // Real hardware only reveals its fan ids once the helper reports them; seed local config for any new id.
  useEffect(() => {
    setFanConfigs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const identity of fanIdentities) {
        if (!next[identity.id]) {
          const stored = loadStoredFanConfigs()[identity.id];
          next[identity.id] = { ...defaultConfig(identity.category), ...stored };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [fanIdentities]);

  const liveFansById = new Map(usingRealHardware && live.data ? live.data.fans.map((f) => [f.id, f]) : []);

  const fans: FanData[] = fanIdentities.map((identity) => {
    const config = fanConfigs[identity.id] ?? defaultConfig(identity.category);
    const desiredPercent = computeDesiredPercent(config, cpuTemp, gpuTemp);

    const name = config.customName ?? identity.name;

    if (usingRealHardware) {
      const liveFan = liveFansById.get(identity.id);
      return {
        id: identity.id,
        name,
        category: identity.category,
        rpm: Math.round(liveFan?.rpm ?? 0),
        maxRpm: identity.maxRpm,
        pwm: Math.round(liveFan?.percent ?? desiredPercent),
        mode: config.mode,
        tempSource: config.tempSource,
        curve: config.curve,
        hysteresis: config.hysteresis,
        responseTime: config.responseTime,
        controllable: identity.controllable,
      };
    }

    return {
      id: identity.id,
      name,
      category: identity.category,
      rpm: Math.round((desiredPercent / 100) * identity.maxRpm),
      maxRpm: identity.maxRpm,
      pwm: Math.round(desiredPercent),
      mode: config.mode,
      tempSource: config.tempSource,
      curve: config.curve,
      hysteresis: config.hysteresis,
      responseTime: config.responseTime,
      controllable: true,
    };
  });

  // Push the desired percent to real hardware whenever temps or configs change.
  useEffect(() => {
    if (!usingRealHardware) return;
    for (const identity of fanIdentities) {
      if (!identity.controllable) continue;
      const config = fanConfigs[identity.id];
      if (!config) continue;
      setLiveFanPercent(identity.id, computeDesiredPercent(config, cpuTemp, gpuTemp));
    }
  }, [usingRealHardware, cpuTemp, gpuTemp, fanConfigs, fanIdentities, setLiveFanPercent]);

  const controllableFans = fans.filter((f) => f.controllable);
  useEffect(() => {
    if (controllableFans.length === 0) return;
    if (!controllableFans.some((f) => f.id === selectedFanId)) {
      setSelectedFanId(controllableFans[0].id);
    }
  }, [controllableFans, selectedFanId]);

  function handleFanChange(updated: FanData) {
    setFanConfigs((prev) => {
      const config = prev[updated.id] ?? defaultConfig(updated.category);
      const identity = fanIdentities.find((f) => f.id === updated.id);
      const customName =
        identity && updated.name !== identity.name ? updated.name : config.customName;
      return {
        ...prev,
        [updated.id]: {
          mode: updated.mode,
          tempSource: updated.tempSource,
          curve: updated.curve,
          hysteresis: updated.hysteresis,
          responseTime: updated.responseTime,
          manualPercent: updated.mode === 'Manual' ? updated.pwm : config.manualPercent,
          customName,
        },
      };
    });
    if (updated.mode === 'Auto') {
      setLiveFanAuto(updated.id);
    }
  }

  function handleProfileChange(next: ProfileId) {
    setProfile(next);
    setFanConfigs((prev) => {
      const out = { ...prev };
      for (const identity of fanIdentities) {
        if (!identity.controllable) continue;
        const percent = getProfilePercent(next, identity.category);
        const config = out[identity.id] ?? defaultConfig(identity.category);
        out[identity.id] = { ...config, mode: 'Manual', manualPercent: percent };
      }
      return out;
    });
  }

  const avgPwm =
    controllableFans.length > 0
      ? controllableFans.reduce((sum, f) => sum + f.pwm, 0) / controllableFans.length
      : 0;
  const noiseDb = 18 + (avgPwm / 100) * 30;

  const sensors: SensorReading[] = [];
  if (cpuTemp !== null) sensors.push({ id: 'cpu', label: 'CPU Package', value: cpuTemp, unit: '°C' });
  if (gpuTemp !== null) sensors.push({ id: 'gpu', label: 'GPU Core', value: gpuTemp, unit: '°C' });
  if (usingRealHardware && live.data) {
    for (const t of live.data.board.temps) {
      sensors.push({ id: t.id, label: t.name, value: t.value, unit: '°C' });
    }
  } else {
    sensors.push({
      id: 'vrm',
      label: 'VRM MOSFET',
      value: clamp((cpuTemp ?? FALLBACK_TEMP) + 6, 30, 95),
      unit: '°C',
    });
    sensors.push({
      id: 'mobo',
      label: 'Motherboard',
      value: clamp((cpuTemp ?? FALLBACK_TEMP) - 14, 25, 70),
      unit: '°C',
    });
    sensors.push({ id: 'ambient', label: 'Ambiente', value: 27, unit: '°C' });
  }

  // Critical-temperature notifications: real hardware only (the simulated VRM can
  // cross 80 °C), at most once per sensor every few minutes.
  const lastAlertAt = useRef(new Map<string, number>());
  const criticalKey = sensors
    .filter((s) => s.value >= CRITICAL_TEMP)
    .map((s) => `${s.id}:${Math.round(s.value)}`)
    .join('|');
  useEffect(() => {
    if (!usingRealHardware || !prefs.criticalAlerts || !criticalKey) return;
    if (typeof Notification === 'undefined') return;
    const now = Date.now();
    for (const sensor of sensors) {
      if (sensor.value < CRITICAL_TEMP) continue;
      const last = lastAlertAt.current.get(sensor.id) ?? 0;
      if (now - last < ALERT_COOLDOWN_MS) continue;
      lastAlertAt.current.set(sensor.id, now);
      new Notification('Temperatura crítica', {
        body: `${sensor.label} está en ${formatTemp(sensor.value, prefs.unit)}.`,
      });
    }
    // sensors is rebuilt every render; criticalKey captures the part that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticalKey, usingRealHardware, prefs.criticalAlerts, prefs.unit]);

  const activeFans = fans.filter((f) => f.rpm > 0).length;

  return (
    <div className="min-h-screen text-ink">
      <div className="backdrop" aria-hidden>
        <span style={{ background: 'var(--blob-1)', width: 620, height: 620, top: -180, left: -120 }} />
        <span
          style={{ background: 'var(--blob-2)', width: 520, height: 520, top: '30%', right: -140, animationDelay: '-8s' }}
        />
        <span
          style={{ background: 'var(--blob-3)', width: 560, height: 560, bottom: -220, left: '25%', animationDelay: '-14s' }}
        />
        <span style={{ background: 'var(--blob-4)', width: 380, height: 380, top: '8%', left: '45%', animationDelay: '-4s' }} />
      </div>

      {/* Custom title bar: drag area for the window; Windows draws its own
          min/max/close buttons over the right end (titleBarOverlay). */}
      <div className="titlebar fixed inset-x-0 top-0 z-40 flex h-10 items-center gap-2 px-4">
        <Fan className="h-3.5 w-3.5 text-accent" />
        <span className="text-xs font-semibold tracking-wide text-muted">FanFlow</span>
      </div>

      <div className="mx-auto flex max-w-[1560px] gap-6 px-6 pb-6 pt-14">
        <Sidebar active={view} onNavigate={setView} />

        <main className="flex min-w-0 flex-1 flex-col gap-5">
          <HeaderStatus
            view={view}
            cpuTemp={cpuTemp}
            gpuTemp={gpuTemp}
            noiseDb={noiseDb}
            cpuModel={hardwareInfo?.cpu.brand}
            gpuModel={hardwareInfo?.gpus[0]?.model}
            dataSource={usingRealHardware ? 'real' : 'simulado'}
          />

          <div className="glass-panel flex-1 rounded-[32px] p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {view === 'dashboard' && (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <OverviewCard
                      cpuTemp={cpuTemp}
                      cpuModel={hardwareInfo?.cpu.brand}
                      gpuModel={hardwareInfo?.gpus[0]?.model}
                      activeFans={activeFans}
                      totalFans={fans.length}
                    />
                    <TemperaturesCard cpuTemp={cpuTemp} gpuTemp={gpuTemp} />
                    <HistoryCard history={cpuHistory} className="md:col-span-2 xl:col-span-1 2xl:col-span-2" />
                    <CoolerDisplayCard cpuTemp={cpuTemp} gpuTemp={gpuTemp} />
                    {fans.map((fan, i) => (
                      <FanCard key={fan.id} fan={fan} onChange={handleFanChange} index={i + 4} />
                    ))}
                  </div>
                )}

                {view === 'curves' &&
                  (controllableFans.length > 0 ? (
                    <FanCurveEditor
                      fans={controllableFans}
                      selectedFanId={selectedFanId}
                      onSelectFan={setSelectedFanId}
                      onChange={handleFanChange}
                      cpuTemp={cpuTemp}
                      gpuTemp={gpuTemp}
                    />
                  ) : (
                    <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
                      <Fan className="h-8 w-8 text-faint" />
                      <p className="text-sm text-muted">No hay ventiladores controlables detectados todavía.</p>
                    </GlassCard>
                  ))}

                {view === 'sensors' && (
                  <SensorsView
                    sensors={sensors}
                    fans={fans}
                    hardware={hardwareInfo}
                    hardwareStatus={hardwareInfoStatus}
                    liveStatus={live.status}
                    liveSupported={live.supported}
                    usingRealHardware={usingRealHardware}
                  />
                )}

                {view === 'memory' && <MemoryView memory={memory} />}

                {view === 'settings' && <SettingsView />}
              </motion.div>
            </AnimatePresence>
          </div>

          {(view === 'dashboard' || view === 'curves') && (
            <ProfileBar active={profile} onChange={handleProfileChange} />
          )}
        </main>
      </div>
    </div>
  );
}
