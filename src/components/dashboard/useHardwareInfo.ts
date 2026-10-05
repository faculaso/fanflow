import { useEffect, useState } from 'react';
import type { HardwareInfo } from './types';

interface HardwareInfoState {
  data: HardwareInfo | null;
  status: 'unsupported' | 'loading' | 'ready' | 'error';
}

export function useHardwareInfo(): HardwareInfoState {
  const [state, setState] = useState<HardwareInfoState>({
    data: null,
    status: window.hardware ? 'loading' : 'unsupported',
  });

  useEffect(() => {
    if (!window.hardware) return;
    let cancelled = false;

    window.hardware
      .getInfo()
      .then((data) => {
        if (!cancelled) setState({ data, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
