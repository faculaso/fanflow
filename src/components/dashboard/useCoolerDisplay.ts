import { useEffect, useState } from 'react';
import type { DisplayConfig } from './types';

/** Shared state for the cooler's USB temperature display (used by the dashboard card and settings). */
export function useCoolerDisplay() {
  const supported = Boolean(window.settings);
  const [config, setConfig] = useState<DisplayConfig>({ enabled: true, source: 'cpu' });
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    window.settings?.get().then((settings) => setConfig(settings.display));
    window.hardware
      ?.getSnapshot()
      .then(({ data }) => setConnected(data?.display?.connected ?? null));
    return window.hardware?.onUpdate((payload) => setConnected(payload.display?.connected ?? null));
  }, []);

  function update(next: DisplayConfig) {
    setConfig(next);
    window.settings?.setDisplay(next);
  }

  return { supported, config, connected, update };
}
