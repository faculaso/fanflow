import { useCallback, useEffect, useState } from 'react';
import type { KeyboardConfig, KeyboardModelId, KeyboardTaskResult, LiveHardwareUpdate } from './types';
import { toRgb565, type PreparedImage } from './keyboardImage';

export interface KeyboardTaskRecord extends KeyboardTaskResult {
  kind: 'upload' | 'time';
  at: number;
}

type KeyboardState = NonNullable<LiveHardwareUpdate['keyboard']>;

/** Keyboard screen state: detection, settings, uploads and clock sync. */
export function useKeyboardScreen() {
  const supported = Boolean(window.keyboardScreen);
  const [device, setDevice] = useState<KeyboardState | null>(null);
  const [config, setConfig] = useState<KeyboardConfig>({ autoSyncTime: true, model: null });
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<KeyboardTaskRecord | null>(null);

  useEffect(() => {
    window.settings?.get().then((settings) => settings.keyboard && setConfig(settings.keyboard));
    window.hardware?.getSnapshot().then(({ data }) => setDevice(data?.keyboard ?? null));
    const offUpdate = window.hardware?.onUpdate((payload) => setDevice(payload.keyboard ?? null));
    const offProgress = window.keyboardScreen?.onProgress(setProgress);
    return () => {
      offUpdate?.();
      offProgress?.();
    };
  }, []);

  const updateConfig = useCallback((next: KeyboardConfig) => {
    setConfig(next);
    window.settings?.setKeyboard(next);
  }, []);

  // The user's pick wins; otherwise trust the name the keyboard reports. In the browser
  // preview there is no keyboard to ask, so default to the most common screen.
  const model: KeyboardModelId | null =
    config.model ?? device?.suggestedModel ?? (supported ? null : 'ajazz128');

  const upload = useCallback(async (image: PreparedImage) => {
    const frameBytes = image.frames[0].width * image.frames[0].height * 2;
    const total = Math.ceil((256 + image.frames.length * frameBytes) / 4096);
    setProgress({ sent: 0, total });
    let result: KeyboardTaskResult;
    if (window.keyboardScreen) {
      result = await window.keyboardScreen.upload(image.model, toRgb565(image.frames), image.delays);
    } else {
      // Browser preview: pretend to send the chunks so the flow can be tried out.
      for (let sent = 1; sent <= total; sent++) {
        await new Promise((r) => setTimeout(r, 15));
        setProgress({ sent, total });
      }
      result = { ok: true };
    }
    setProgress(null);
    setLastResult({ ...result, kind: 'upload', at: Date.now() });
    return result;
  }, []);

  const syncTime = useCallback(async () => {
    if (!model) return;
    setSyncing(true);
    const result = window.keyboardScreen ? await window.keyboardScreen.syncTime(model) : { ok: true };
    setSyncing(false);
    setLastResult({ ...result, kind: 'time', at: Date.now() });
  }, [model]);

  return {
    supported,
    connected: device?.connected ?? null,
    product: device?.product ?? null,
    suggestedModel: device?.suggestedModel ?? null,
    model,
    config,
    updateConfig,
    upload,
    uploading: progress !== null,
    progress,
    syncTime,
    syncing,
    lastResult,
  };
}

export type KeyboardScreen = ReturnType<typeof useKeyboardScreen>;
