import type {
  DisplayConfig,
  HardwareInfo,
  HardwareStatus,
  KeyboardConfig,
  KeyboardModelId,
  KeyboardTaskResult,
  LiveHardwareUpdate,
  MemoryCleanResult,
  MemoryOperation,
} from './components/dashboard/types';

export {};

declare global {
  /** package.json version, injected by Vite. */
  const __APP_VERSION__: string;

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
        keyboard: KeyboardConfig;
        startWithWindows: boolean;
        startWithWindowsSupported: boolean;
      }>;
      /** Resolves with the actual state after the change (false if registering failed). */
      setStartWithWindows: (value: boolean) => Promise<boolean>;
      setMinimizeToTray: (value: boolean) => Promise<void>;
      setDisplay: (config: DisplayConfig) => Promise<void>;
      setKeyboard: (config: KeyboardConfig) => Promise<void>;
    };
    /** TFT screen on 0C45:8009 keyboards (Ajazz AK820 Pro / AKS075, Monka KG991W). */
    keyboardScreen?: {
      syncTime: (model: KeyboardModelId) => Promise<KeyboardTaskResult>;
      /** frames: RGB565 LE pixels of every frame back to back; delays in ms, one per frame. */
      upload: (model: KeyboardModelId, frames: Uint8Array, delays: number[]) => Promise<KeyboardTaskResult>;
      onProgress: (callback: (progress: { sent: number; total: number }) => void) => () => void;
    };
  }
}
