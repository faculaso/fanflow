# FanFlow

Control de refrigeración y monitoreo de hardware para Windows: curvas de ventiladores, temperaturas en vivo, el display de temperatura del disipador y liberación de memoria RAM, en una interfaz con estilo *glassmorphism* clara u oscura.

## Funciones

- **Ventiladores:** control manual o por curva automática de cada canal de la placa madre y de la GPU, con perfiles rápidos (Silencioso, Balanceado, Alto rendimiento, Juegos).
- **Editor de curvas:** puntos arrastrables temperatura → velocidad, con la temperatura actual marcada en el gráfico.
- **Sensores:** temperaturas de CPU, GPU y placa madre, y el estado de cada ventilador.
- **Display del disipador:** manda la temperatura de la CPU o la GPU al mini display de 7 segmentos de disipadores Redragon / CSM / Alseye / Coolmoon (USB HID `5131:2007`), sin el software del fabricante.
- **Memoria:** libera RAM como QuickCPU o RAMMap (vaciar *working sets*, lista modificada, lista en espera, caché de archivos), a mano o automáticamente al superar un umbral de uso.
- **Iniciar con Windows:** arranca minimizado en la bandeja, sin pedir permisos en cada inicio.
- **Alertas** de temperatura crítica (80 °C), unidades °C / °F y tema claro u oscuro.

## Requisitos

- Windows 10 u 11 de 64 bits.
- Permisos de administrador: el acceso a sensores, ventiladores y memoria lo exige. FanFlow los pide al abrirse.

## Instalación

Descargá el instalador (`FanFlow Setup x.y.z.exe`) o la versión portable (`FanFlow x.y.z.exe`) desde [Releases](../../releases).

El ejecutable no está firmado digitalmente, así que Windows SmartScreen puede mostrar "Windows protegió su PC". Tocá **Más información → Ejecutar de todas formas**.

El instalador también instala [PawnIO](https://github.com/namazso/PawnIO) si no está presente. Es el driver que usa LibreHardwareMonitor para leer sensores y controlar ventiladores.

## Desarrollo

Necesitás [Node.js](https://nodejs.org/) 20.19 o superior y el [SDK de .NET 9](https://dotnet.microsoft.com/download).

```bash
npm install
```

```bash
npm run build:helper
```

```bash
npm run electron:dev
```

El helper de hardware requiere administrador. Sin él, la interfaz funciona igual en modo **simulado**, con datos de ejemplo. `npm run dev` abre solo la interfaz en el navegador, también simulada.

Para generar el instalador y la versión portable en `release/`:

```bash
npm run electron:build
```

### Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/` | Interfaz en React + TypeScript + Tailwind CSS 4. |
| `electron/` | Proceso principal de Electron: ventana, bandeja, preferencias, inicio con Windows y el puente con el helper. |
| `hardware-helper/` | Helper en C# (.NET 9) que corre elevado. Lee sensores y controla ventiladores con LibreHardwareMonitor, maneja el display del disipador y libera memoria. |
| `build-resources/` | Íconos, script del instalador NSIS y el instalador de PawnIO. |

La interfaz y el helper se comunican por stdin/stdout con mensajes JSON, uno por línea.

### Protocolo del display del disipador

Un reporte HID de salida de 65 bytes, enviado una vez por segundo:

```
00 40 TT 00 00 …
│  │  └─ temperatura en °C (0–99)
│  └──── comando (constante)
└─────── report ID
```

Gracias a [csm-cooler-lcd](https://github.com/YehanKD/csm-cooler-lcd) y [bemless-m120d-plus](https://github.com/AnthonyKeyGH/bemless-m120d-plus), que documentaron el protocolo.

## Componentes de terceros

| Componente | Licencia |
| --- | --- |
| [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) | MPL-2.0 |
| [PawnIO](https://github.com/namazso/PawnIO) (se distribuye su instalador, sin modificar) | GPL-2.0 |
| [HidSharp](https://www.zer7.com/software/hidsharp) | Apache-2.0 |
| [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Recharts](https://recharts.org/), [Framer Motion](https://motion.dev/), [Lucide](https://lucide.dev/) | MIT |
| [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) | OFL-1.1 |

## Aviso

FanFlow escribe directamente en el hardware: velocidad de ventiladores y listas de memoria del sistema. Una curva mal configurada puede dejar componentes sin refrigeración suficiente. Usalo bajo tu propia responsabilidad. Al cerrar la app, todos los ventiladores vuelven al control de la BIOS.
