import type {
  DisplayConfig,
  HardwareInfo,
  HardwareStatus,
  LiveHardwareUpdate,
  MemoryCleanResult,
  MemoryOperation,
} from './components/dashboard/types';

export {};

declare global {
  interface Window {
    hardware?: {
      getInfo: () => Promise<HardwareInfo>;
      getSnapshot: () => Promise<{ status: HardwareStatus | null; data: LiveHardwareUpdate | null }>;
      getDiagnostics: () => Promise<string | null>;
      copyDiagnostics: () => Promise<boolean>;
      onUpdate: (callback: (payload: LiveHardwareUpdate) => void) => () => void;
      onStatus: (callback: (payload: HardwareStatus) => void) => () => void;
      setFanPercent: (id: string, percent: number) => Promise<void>;
      setFanAuto: (id: string) => Promise<void>;
      cleanMemory: (operations: MemoryOperation[]) => Promise<MemoryCleanResult>;
    };
    appWindow?: {
      /** Recolours the native min/max/close buttons drawn over the custom title bar. */
      setTheme: (theme: 'light' | 'dark') => Promise<void>;
    };
    settings?: {
      get: () => Promise<{
        minimizeToTray: boolean;
        display: DisplayConfig;
        startWithWindows: boolean;
        startWithWindowsSupported: boolean;
      }>;
      /** Resolves with the actual state after the change (false if registering failed). */
      setStartWithWindows: (value: boolean) => Promise<boolean>;
      setMinimizeToTray: (value: boolean) => Promise<void>;
      setDisplay: (config: DisplayConfig) => Promise<void>;
    };
  }
}
