import { useCallback, useEffect, useRef, useState } from 'react';
import type { HardwareStatus, LiveHardwareUpdate } from './types';

interface LiveHardwareState {
  supported: boolean;
  status: HardwareStatus | null;
  data: LiveHardwareUpdate | null;
}

export function useLiveHardware() {
  const supported = Boolean(window.hardware);
  const [state, setState] = useState<LiveHardwareState>({
    supported,
    status: null,
    data: null,
  });
  const lastSentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!window.hardware) return;

    // The helper's first status can arrive (and be dropped, since main->renderer IPC
    // isn't buffered) before this listener is registered — pull whatever already
    // happened once we're actually mounted, in addition to subscribing to new pushes.
    window.hardware.getSnapshot().then(({ status, data }) => {
      if (status || data) {
        setState((prev) => ({
          ...prev,
          status: status ?? prev.status,
          data: data ?? prev.data,
        }));
      }
    });

    const offUpdate = window.hardware.onUpdate((data) => {
      setState((prev) => ({ ...prev, data }));
    });
    const offStatus = window.hardware.onStatus((status) => {
      setState((prev) => ({ ...prev, status: { ...prev.status, ...status } }));
    });

    return () => {
      offUpdate();
      offStatus();
    };
  }, []);

  const setFanPercent = useCallback((id: string, percent: number) => {
    const rounded = Math.round(percent);
    const last = lastSentRef.current.get(id);
    if (last === rounded) return;
    lastSentRef.current.set(id, rounded);
    window.hardware?.setFanPercent(id, rounded);
  }, []);

  const setFanAuto = useCallback((id: string) => {
    lastSentRef.current.delete(id);
    window.hardware?.setFanAuto(id);
  }, []);

  return { ...state, setFanPercent, setFanAuto };
}
