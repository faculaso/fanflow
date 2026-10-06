export type TempSource = 'CPU' | 'GPU' | 'VRM';

export type FanMode = 'Auto' | 'Manual';

/** Free-form label: fixed categories for the mock demo, raw sensor names for real hardware. */
export type FanCategory = string;

export interface CurvePoint {
  temp: number;
  speed: number;
}

export interface FanData {
  id: string;
  name: string;
  category: FanCategory;
  rpm: number;
  maxRpm: number;
  pwm: number;
  mode: FanMode;
  tempSource: TempSource;
  curve: CurvePoint[];
  hysteresis: number;
  responseTime: number;
  /** false for tach-only headers that report RPM but can't be driven (no software Control sensor). */
  controllable: boolean;
}

export type ProfileId = 'silent' | 'balanced' | 'performance' | 'gaming';

export interface ProfileOption {
  id: ProfileId;
  label: string;
}

export type DashboardView = 'dashboard' | 'curves' | 'sensors' | 'memory' | 'keyboard' | 'settings';

export interface SensorReading {
  id: string;
  label: string;
  value: number;
  unit: string;
  icon?: string;
}

export interface CpuInfo {
  manufacturer: string;
  brand: string;
  physicalCores: number;
  cores: number;
  speed: number;
}

export interface GpuInfo {
  vendor: string;
  model: string;
  vram: number | null;
}

export interface HardwareInfo {
  cpu: CpuInfo;
  gpus: GpuInfo[];
}

export interface LiveFan {
  id: string;
  name: string;
  rpm: number | null;
  percent: number | null;
  controllable: boolean;
}

export interface LiveBoardTemp {
  id: string;
  name: string;
  value: number;
}

export interface LiveHardwareUpdate {
  type: 'update';
  cpu: { temp: number | null; load: number | null };
  gpu: { temp: number | null; load: number | null; name: string | null };
  board: { temps: LiveBoardTemp[] };
  fans: LiveFan[];
  display?: { connected: boolean };
  keyboard?: {
    connected: boolean;
    busy: boolean;
    /** USB product string, e.g. "KG991W USB keyboard". */
    product?: string | null;
    suggestedModel?: KeyboardModelId | null;
  };
  memory?: MemoryStats | null;
}

/** Physical memory in bytes. The list breakdown is absent if the helper couldn't read it. */
export interface MemoryStats {
  total: number;
  available: number;
  load: number;
  standby?: number;
  modified?: number;
  free?: number;
}

export type MemoryOperation = 'workingSets' | 'fileCache' | 'modified' | 'lowStandby' | 'standby';

export interface MemoryCleanResult {
  ok: boolean;
  error?: string;
  /** Bytes moved to the free list (or gained as available, if the breakdown is unknown). */
  freed: number;
  availableGained: number;
  results: { op: MemoryOperation; ok: boolean; error?: string }[];
}

/** Cooler temperature display (USB HID 5131:2007). */
export interface DisplayConfig {
  enabled: boolean;
  source: 'cpu' | 'gpu';
}

/** Screen variants of the 0C45:8009 board; must match KeyboardScreen.Models in the helper. */
export type KeyboardModelId = 'ajazz128' | 'monka160x80';

export interface KeyboardConfig {
  /** Set the keyboard's clock whenever it's plugged in. */
  autoSyncTime: boolean;
  /** Screen picked by the user; null = follow the keyboard's own name. */
  model: KeyboardModelId | null;
}

export interface KeyboardTaskResult {
  ok: boolean;
  error?: string;
}

export interface HardwareStatus {
  admin: boolean;
  ok: boolean;
  error?: string;
  warning?: string;
}
