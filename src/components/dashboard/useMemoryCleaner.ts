import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoryCleanResult, MemoryOperation, MemoryStats } from './types';
import { clamp } from './utils';

export interface MemorySettings {
  operations: MemoryOperation[];
  autoEnabled: boolean;
  /** Clean automatically when RAM usage reaches this percent. */
  autoThreshold: number;
}

export interface MemoryCleanRecord extends MemoryCleanResult {
  at: number;
  automatic: boolean;
}

const STORAGE_KEY = 'fanflow:memory';
const AUTO_COOLDOWN_MS = 5 * 60 * 1000;
const GB = 1024 ** 3;

export const DEFAULT_OPERATIONS: MemoryOperation[] = ['workingSets', 'modified', 'standby'];

function loadSettings(): MemorySettings {
  const defaults: MemorySettings = { operations: DEFAULT_OPERATIONS, autoEnabled: false, autoThreshold: 85 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

/** Plausible 16 GB machine for the browser preview, so the view is usable without the helper. */
function useMockMemory(active: boolean) {
  const [stats, setStats] = useState<MemoryStats>({
    total: 16 * GB,
    available: 6.2 * GB,
    load: 61,
    standby: 4.8 * GB,
    modified: 0.3 * GB,
    free: 1.1 * GB,
  });

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setStats((s) => {
        // Memory slowly fills back up with cache, like a real system.
        const free = clamp((s.free ?? 0) - Math.random() * 0.15 * GB, 0.4 * GB, 8 * GB);
        const standby = clamp((s.standby ?? 0) + Math.random() * 0.12 * GB, 0.5 * GB, 7 * GB);
        const available = clamp(s.available + (Math.random() - 0.55) * 0.15 * GB, 2 * GB, 12 * GB);
        return { ...s, free, standby, available, load: Math.round((1 - available / s.total) * 100) };
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [active]);

  const statsRef = useRef(stats);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const simulateClean = useCallback(
    async (operations: MemoryOperation[]): Promise<MemoryCleanResult> => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      // Computed from the latest snapshot: state updaters run later, not inline.
      const s = statsRef.current;
      const gained = operations.includes('workingSets') ? 1.4 * GB : 0;
      const fromStandby = operations.includes('standby') ? (s.standby ?? 0) * 0.85 : 0;
      const freed = gained + fromStandby;
      const available = Math.min(s.total, s.available + gained);
      setStats({
        ...s,
        available,
        load: Math.round((1 - available / s.total) * 100),
        standby: (s.standby ?? 0) - fromStandby,
        modified: operations.includes('modified') ? 0.02 * GB : s.modified,
        free: (s.free ?? 0) + freed,
      });
      return {
        ok: true,
        freed,
        availableGained: gained,
        results: operations.map((op) => ({ op, ok: true })),
      };
    },
    [],
  );

  return { stats, simulateClean };
}

export function useMemoryCleaner(liveStats: MemoryStats | null | undefined, usingRealHardware: boolean) {
  const mock = useMockMemory(!usingRealHardware);
  const stats = usingRealHardware ? (liveStats ?? null) : mock.stats;

  const [settings, setSettingsState] = useState(loadSettings);
  const [cleaning, setCleaning] = useState(false);
  const [lastClean, setLastClean] = useState<MemoryCleanRecord | null>(null);
  const cleaningRef = useRef(false);
  const lastAutoAt = useRef(0);

  const updateSettings = useCallback((patch: Partial<MemorySettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // not persisted; still applies this session
      }
      return next;
    });
  }, []);

  const { simulateClean } = mock;
  const clean = useCallback(
    async (operations: MemoryOperation[], automatic = false) => {
      if (cleaningRef.current || operations.length === 0) return;
      cleaningRef.current = true;
      setCleaning(true);
      try {
        const result =
          usingRealHardware && window.hardware
            ? await window.hardware.cleanMemory(operations)
            : await simulateClean(operations);
        setLastClean({ ...result, at: Date.now(), automatic });
      } finally {
        cleaningRef.current = false;
        setCleaning(false);
      }
    },
    [usingRealHardware, simulateClean],
  );

  // Automatic cleaning, like QuickCPU's threshold trigger: at most once per cooldown.
  const load = stats?.load ?? 0;
  useEffect(() => {
    if (!settings.autoEnabled || load < settings.autoThreshold) return;
    if (Date.now() - lastAutoAt.current < AUTO_COOLDOWN_MS) return;
    lastAutoAt.current = Date.now();
    void clean(settings.operations, true);
  }, [load, settings.autoEnabled, settings.autoThreshold, settings.operations, clean]);

  return { stats, settings, updateSettings, clean, cleaning, lastClean, simulated: !usingRealHardware };
}

export type MemoryCleaner = ReturnType<typeof useMemoryCleaner>;
