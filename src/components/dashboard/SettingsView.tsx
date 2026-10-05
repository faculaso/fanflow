import { useEffect, useState, type ReactNode } from 'react';
import { BellRing, Monitor, MonitorSmartphone, Moon, Palette, Power, Sun, Thermometer } from 'lucide-react';
import { CardHeader, GlassCard, Segmented, StatusChip, Toggle } from './ui';
import { setPreferences, usePreferences } from './preferences';
import { useCoolerDisplay } from './useCoolerDisplay';

function SettingRow({
  icon,
  label,
  description,
  control,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-chip px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip-active text-muted">
          {icon}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </div>
      {control}
    </div>
  );
}

export default function SettingsView() {
  const prefs = usePreferences();
  const desktop = Boolean(window.settings);

  const [startWithWindows, setStartWithWindows] = useState(false);
  const [startWithWindowsSupported, setStartWithWindowsSupported] = useState(false);
  const [startWithWindowsBusy, setStartWithWindowsBusy] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  const display = useCoolerDisplay();

  useEffect(() => {
    window.settings?.get().then((settings) => {
      setMinimizeToTray(settings.minimizeToTray);
      setStartWithWindows(settings.startWithWindows);
      setStartWithWindowsSupported(settings.startWithWindowsSupported);
    });
  }, []);

  async function handleStartWithWindows(next: boolean) {
    if (!window.settings) return;
    setStartWithWindowsBusy(true);
    try {
      // Registering the scheduled task can fail; show what Windows actually ended up with.
      setStartWithWindows(await window.settings.setStartWithWindows(next));
    } finally {
      setStartWithWindowsBusy(false);
    }
  }

  function handleMinimizeToTray(next: boolean) {
    setMinimizeToTray(next);
    window.settings?.setMinimizeToTray(next);
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <GlassCard delay={0}>
        <CardHeader icon={<Power className="h-4 w-4" />} title="General" subtitle="Cómo se comporta FanFlow" />
        <div className="flex flex-col gap-2.5">
          <SettingRow
            icon={<Power className="h-4 w-4" />}
            label="Iniciar con Windows"
            description={
              startWithWindowsSupported
                ? 'Abre FanFlow minimizado en la bandeja al iniciar sesión.'
                : 'Solo disponible en la versión instalada.'
            }
            control={
              <Toggle
                label="Iniciar con Windows"
                checked={startWithWindows}
                disabled={!startWithWindowsSupported || startWithWindowsBusy}
                onChange={handleStartWithWindows}
              />
            }
          />
          <SettingRow
            icon={<Monitor className="h-4 w-4" />}
            label="Minimizar a la bandeja"
            description={
              desktop ? 'Al cerrar la ventana, FanFlow sigue corriendo.' : 'Solo disponible en la app de escritorio.'
            }
            control={
              <Toggle
                label="Minimizar a la bandeja"
                checked={minimizeToTray}
                disabled={!desktop}
                onChange={handleMinimizeToTray}
              />
            }
          />
          <SettingRow
            icon={<BellRing className="h-4 w-4" />}
            label="Alertas de temperatura crítica"
            description="Notificación de Windows si un sensor supera los 80 °C."
            control={
              <Toggle
                label="Alertas de temperatura crítica"
                checked={prefs.criticalAlerts}
                onChange={(criticalAlerts) => setPreferences({ criticalAlerts })}
              />
            }
          />
        </div>
      </GlassCard>

      <GlassCard delay={1}>
        <CardHeader icon={<Palette className="h-4 w-4" />} title="Apariencia" subtitle="Tema y unidades" />
        <div className="flex flex-col gap-2.5">
          <SettingRow
            icon={prefs.theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            label="Tema"
            description="Claro o oscuro, en toda la app."
            control={
              <Segmented
                size="sm"
                options={[
                  { value: 'light', label: 'Claro' },
                  { value: 'dark', label: 'Oscuro' },
                ]}
                value={prefs.theme}
                onChange={(theme) => setPreferences({ theme })}
              />
            }
          />
          <SettingRow
            icon={<Thermometer className="h-4 w-4" />}
            label="Unidad de temperatura"
            description="Se aplica a toda la interfaz."
            control={
              <Segmented
                size="sm"
                options={[
                  { value: 'C', label: '°C' },
                  { value: 'F', label: '°F' },
                ]}
                value={prefs.unit}
                onChange={(unit) => setPreferences({ unit })}
              />
            }
          />
        </div>
      </GlassCard>

      <GlassCard delay={2} className="xl:col-span-2">
        <CardHeader
          icon={<MonitorSmartphone className="h-4 w-4" />}
          title="Display del disipador"
          subtitle="Pantalla de temperatura del cooler (Redragon / CSM / Alseye, USB 5131:2007)"
          action={
            display.supported && (
              <StatusChip tone={display.connected ? 'ok' : 'muted'}>
                {display.connected ? 'Conectado' : 'No detectado'}
              </StatusChip>
            )
          }
        />
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <SettingRow
            icon={<MonitorSmartphone className="h-4 w-4" />}
            label="Mostrar temperatura"
            description="Se envía al display una vez por segundo."
            control={
              <Toggle
                label="Mostrar temperatura en el display"
                checked={display.config.enabled}
                disabled={!display.supported}
                onChange={(enabled) => display.update({ ...display.config, enabled })}
              />
            }
          />
          <SettingRow
            icon={<Thermometer className="h-4 w-4" />}
            label="Fuente de temperatura"
            description="Qué sensor muestra el display."
            control={
              <Segmented
                size="sm"
                options={[
                  { value: 'cpu', label: 'CPU' },
                  { value: 'gpu', label: 'GPU' },
                ]}
                value={display.config.source}
                disabled={!display.supported || !display.config.enabled}
                onChange={(source) => display.update({ ...display.config, source })}
              />
            }
          />
        </div>
      </GlassCard>
    </div>
  );
}
