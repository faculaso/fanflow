# FanFlow

Control de refrigeración y monitoreo de hardware para Windows: curvas de ventiladores, temperaturas en vivo, el display de temperatura del disipador liberación de memoria RAM y GIFs en la pantallita del teclado, en una interfaz con estilo *glassmorphism* clara u oscura.

## Funciones

- **Ventiladores:** control manual o por curva automática de cada canal de la placa madre y de la GPU, con perfiles rápidos (Silencioso, Balanceado, Alto rendimiento, Juegos).
- **Editor de curvas:** puntos arrastrables temperatura → velocidad, con la temperatura actual marcada en el gráfico.
- **Sensores:** temperaturas de CPU, GPU y placa madre, y el estado de cada ventilador.
- **Display del disipador:** manda la temperatura de la CPU o la GPU al mini display de 7 segmentos de disipadores Redragon / CSM / Alseye / Coolmoon (USB HID `5131:2007`), sin el software del fabricante.
- **Memoria:** libera RAM como QuickCPU o RAMMap (vaciar *working sets*, lista modificada, lista en espera, caché de archivos), a mano o automáticamente al superar un umbral de uso.
- **Pantalla del teclado** (experimental): sube GIFs e imágenes a la pantallita de teclados con la placa Sonix / HFD `RKGK890` (USB `0C45:8009`) y les pone la hora, sin el programa del fabricante. Solo por cable. Pantallas soportadas: 128 × 128 (Ajazz AK820 Pro, AKS075 y variantes Epomaker) y 160 × 80 (Monka / Marvo Storm KG991W).
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
| `hardware-helper/` | Helper en C# (.NET 9) que corre elevado. Lee sensores y controla ventiladores con LibreHardwareMonitor, maneja el display del disipador y la pantalla del teclado, y libera memoria. |
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

### Protocolo de la pantalla del teclado

Dos interfaces HID de fabricante, que solo aparecen por cable:

| Interfaz | Usage page | Uso |
| --- | --- | --- |
| Control | `0xFF13` | Comandos: *feature reports* de 64 bytes `04 cmd sub … ` |
| Datos | `0xFF68` | Imagen: *output reports* de 4096 bytes, con un ACK de 64 bytes después de cada uno |

Para subir una imagen se envía `START (04 18)`, luego `IMAGE_CFG (04 72 03, bytes 8-9 = cantidad de bloques)`, después los bloques de datos y al final `SAVE (04 02)`. Los datos son una cabecera de 256 bytes (cantidad de cuadros y la demora de cada uno en unidades de 2 ms) seguida de los cuadros en RGB565 *little-endian*.

Todos estos teclados usan el mismo identificador USB y variantes del mismo programa del fabricante (`DeviceDriver.exe`), pero con pantallas de distinto tamaño. Por eso FanFlow identifica el modelo por el nombre que reporta el teclado y, si no lo reconoce, pide elegir la pantalla antes de enviar. Los datos del KG991W (pantalla de 160 × 80, *slot* y formato del reloj) salen de desensamblar su programa oficial.

Gracias a [aks075-linux](https://github.com/aar-rafi/aks075-linux), [ajazz-ak820-config](https://github.com/Beattrey/ajazz-ak820-config) y [EPOMAKER-Ajazz-AK820-Pro](https://github.com/gohv/EPOMAKER-Ajazz-AK820-Pro), que relevaron el protocolo a partir del driver oficial.

## Componentes de terceros

| Componente | Licencia |
| --- | --- |
| [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) | MPL-2.0 |
| [PawnIO](https://github.com/namazso/PawnIO) (se distribuye su instalador, sin modificar) | GPL-2.0 |
| [HidSharp](https://www.zer7.com/software/hidsharp) | Apache-2.0 |
| [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Recharts](https://recharts.org/), [Framer Motion](https://motion.dev/), [Lucide](https://lucide.dev/) | MIT |
| [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) | OFL-1.1 |

## Licencia

FanFlow se distribuye bajo la [licencia MIT](LICENSE). Los componentes de terceros mantienen sus propias licencias (ver arriba).

## Aviso

FanFlow escribe directamente en el hardware: velocidad de ventiladores y listas de memoria del sistema. Una curva mal configurada puede dejar componentes sin refrigeración suficiente. Usalo bajo tu propia responsabilidad. Al cerrar la app, todos los ventiladores vuelven al control de la BIOS.
