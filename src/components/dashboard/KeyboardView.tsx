import { useEffect, useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import { Clock, ImagePlus, Info, Keyboard, Loader2, Send } from 'lucide-react';
import { prepareImage, SCREEN_MODELS, type FitMode, type PreparedImage, type ScreenModel } from './keyboardImage';
import type { KeyboardModelId } from './types';
import type { KeyboardScreen } from './useKeyboardScreen';
import { CardHeader, GlassCard, Segmented, StatusChip, Toggle } from './ui';

const ACCEPT = 'image/gif,image/png,image/jpeg,image/webp,image/bmp';

const FIT_OPTIONS = [
  { value: 'cover' as const, label: 'Llenar' },
  { value: 'contain' as const, label: 'Ajustar' },
];

const MODEL_OPTIONS = Object.values(SCREEN_MODELS).map((m) => ({ value: m.id, label: m.label }));

/** Longest side of the on-screen preview, in CSS pixels. */
const PREVIEW_SIZE = 240;

function errorMessage(error: string | undefined): string {
  switch (error) {
    case 'keyboard-not-found':
      return 'No se encontró el teclado. Conectalo con el cable USB.';
    case 'helper-unavailable':
      return 'El sensor de hardware no está corriendo.';
    case 'timeout':
      return 'El teclado dejó de responder.';
    default:
      return error ? `Error: ${error}` : 'Algo salió mal.';
  }
}

/** Plays the prepared frames on a canvas at the screen's real timing. */
function ScreenPreview({ image, screen }: { image: PreparedImage | null; screen: ScreenModel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (!image) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, screen.width, screen.height);
      return;
    }
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      ctx.putImageData(image.frames[index], 0, 0);
      if (image.frames.length > 1) {
        timer = setTimeout(show, image.delays[index]);
        index = (index + 1) % image.frames.length;
      }
    };
    show();
    return () => clearTimeout(timer);
  }, [image, screen]);

  const scale = PREVIEW_SIZE / Math.max(screen.width, screen.height);

  return (
    <div className="rounded-[22px] bg-[#16171f] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_30px_-12px_rgba(0,0,0,0.5)]">
      <canvas
        ref={canvasRef}
        width={screen.width}
        height={screen.height}
        style={{ width: screen.width * scale, height: screen.height * scale }}
        className="block rounded-[10px] bg-black"
      />
    </div>
  );
}

export default function KeyboardView({ keyboard }: { keyboard: KeyboardScreen }) {
  const { connected, product, suggestedModel, model, config, updateConfig, upload, uploading, progress, syncTime, syncing, lastResult } =
    keyboard;
  const [file, setFile] = useState<File | null>(null);
  const [fit, setFit] = useState<FitMode>('cover');
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file || !model) return;
    let cancelled = false;
    setPreparing(true);
    setPrepareError(false);
    prepareImage(file, fit, model)
      .then((prepared) => !cancelled && setImage(prepared))
      .catch(() => !cancelled && (setImage(null), setPrepareError(true)))
      .finally(() => !cancelled && setPreparing(false));
    return () => {
      cancelled = true;
    };
  }, [file, fit, model]);

  function pick(files: FileList | null) {
    const next = files?.[0];
    if (next && next.type.startsWith('image/')) setFile(next);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  }

  const screen = SCREEN_MODELS[model ?? 'ajazz128'];
  const busy = uploading || syncing;
  const canSend = Boolean(image) && image?.model === model && !busy && !preparing && connected !== false;
  const sizeKb = image ? Math.round((image.frames.length * screen.width * screen.height * 2) / 1024) : 0;

  function pickModel(next: KeyboardModelId) {
    // Picking what the keyboard already says it is goes back to automatic detection.
    updateConfig({ ...config, model: next === suggestedModel ? null : next });
  }
  const percent = progress ? Math.round((progress.sent / progress.total) * 100) : 0;

  const status =
    connected === null ? (
      <StatusChip tone="muted">{keyboard.supported ? 'Buscando…' : 'Simulado'}</StatusChip>
    ) : connected ? (
      <StatusChip tone="ok">Conectado</StatusChip>
    ) : (
      <StatusChip tone="muted">No detectado</StatusChip>
    );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <GlassCard delay={0} className="xl:col-span-2">
        <CardHeader
          icon={<ImagePlus className="h-4 w-4" />}
          title="Imagen o GIF"
          subtitle="Se guarda en el teclado y queda aunque cierres FanFlow"
        />

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex flex-col items-center gap-3">
            <ScreenPreview image={image?.model === model ? image : null} screen={screen} />
            <Segmented size="sm" options={FIT_OPTIONS} value={fit} onChange={setFit} disabled={busy} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              disabled={busy}
              className={`flex min-h-[150px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed px-4 py-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                dragging ? 'border-accent bg-accent-soft' : 'border-line bg-chip hover:border-accent/60'
              }`}
            >
              {preparing ? (
                <Loader2 className="h-7 w-7 animate-spin text-accent" />
              ) : (
                <ImagePlus className="h-7 w-7 text-accent" />
              )}
              {image ? (
                <>
                  <span className="max-w-full truncate text-sm font-semibold text-ink">{image.name}</span>
                  <span className="text-xs text-muted">
                    {image.frames.length === 1 ? 'Imagen fija' : `${image.frames.length} cuadros`} · {sizeKb} KB
                    {image.sourceFrames > image.frames.length && ` · reducido de ${image.sourceFrames} cuadros`}
                  </span>
                  <span className="text-xs font-medium text-accent-ink">Tocá o arrastrá otra para cambiarla</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-ink">Arrastrá un GIF o una imagen</span>
                  <span className="text-xs text-muted">o tocá para elegir · GIF, PNG, JPG, WebP</span>
                </>
              )}
              {prepareError && <span className="text-xs font-semibold text-hot">No se pudo leer ese archivo.</span>}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                pick(event.target.files);
                event.target.value = '';
              }}
            />

            <div className="flex flex-wrap items-center gap-4">
              <motion.button
                type="button"
                whileHover={{ scale: canSend ? 1.03 : 1 }}
                whileTap={{ scale: 0.97 }}
                disabled={!canSend}
                onClick={() => image && upload(image)}
                className="accent-gradient chip-shadow flex h-12 items-center gap-2.5 rounded-full px-7 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {uploading ? `Enviando… ${percent}%` : 'Enviar al teclado'}
              </motion.button>
              <p className="min-w-0 flex-1 text-xs text-muted">
                {connected === false
                  ? 'Conectá el teclado con el cable USB para enviar.'
                  : !model
                    ? 'Elegí el modelo de pantalla de tu teclado (a la derecha).'
                    : lastResult?.kind === 'upload'
                    ? lastResult.ok
                      ? '¡Listo! La imagen ya está en el teclado.'
                      : errorMessage(lastResult.error)
                    : 'No desconectes el teclado mientras se envía.'}
              </p>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-track">
              <motion.div
                className="accent-gradient h-full"
                initial={false}
                animate={{ width: `${uploading ? percent : lastResult?.kind === 'upload' && lastResult.ok ? 100 : 0}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard delay={1} className="flex flex-col">
        <CardHeader
          icon={<Keyboard className="h-4 w-4" />}
          title="Teclado"
          subtitle={product ?? 'Ajazz, Epomaker, Monka y similares'}
          action={status}
        />

        <p className="text-sm font-semibold text-ink">Pantalla</p>
        <Segmented
          className="mt-2"
          size="sm"
          options={MODEL_OPTIONS}
          value={model}
          disabled={busy}
          onChange={pickModel}
        />
        <p className="mt-2 text-xs text-muted">
          {model
            ? `${SCREEN_MODELS[model].keyboards}${model === suggestedModel ? ' · detectado automáticamente' : ''}`
            : 'Los modelos compatibles usan la misma placa con pantallas distintas. Elegí la tuya.'}
        </p>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-chip px-4 py-3.5">
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold text-ink">Poner en hora al conectar</p>
            <p className="mt-1 text-xs text-muted">El reloj de la pantalla se atrasa si no lo sincroniza nadie.</p>
          </div>
          <Toggle
            label="Poner en hora al conectar"
            checked={config.autoSyncTime}
            onChange={(autoSyncTime) => updateConfig({ ...config, autoSyncTime })}
          />
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
          <button
            type="button"
            disabled={busy || connected === false || !model}
            onClick={syncTime}
            className="flex h-10 items-center gap-2 rounded-full bg-chip-active/70 px-5 text-[13px] font-semibold text-ink transition-colors hover:bg-chip-active disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            Sincronizar hora
          </button>
          {lastResult?.kind === 'time' && (
            <span className={`text-xs font-semibold ${lastResult.ok ? 'text-ok' : 'text-hot'}`}>
              {lastResult.ok ? 'Hora sincronizada' : errorMessage(lastResult.error)}
            </span>
          )}
        </div>
      </GlassCard>

      <GlassCard delay={2} className="xl:col-span-3">
        <CardHeader icon={<Info className="h-4 w-4" />} title="Antes de enviar" />
        <div className="grid grid-cols-1 gap-2.5 text-xs text-muted md:grid-cols-3">
          <p className="rounded-2xl bg-chip px-4 py-3">
            <span className="font-semibold text-ink">Solo por cable.</span> Por Bluetooth o 2.4 GHz el teclado no
            permite cambiar la pantalla.
          </p>
          <p className="rounded-2xl bg-chip px-4 py-3">
            <span className="font-semibold text-ink">Cerrá el programa del fabricante</span> si lo tenés abierto, para
            que no se pisen.
          </p>
          <p className="rounded-2xl bg-chip px-4 py-3">
            <span className="font-semibold text-ink">Función experimental.</span> Usa el mismo protocolo que el driver
            oficial; un GIF largo puede tardar un par de minutos en enviarse.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
