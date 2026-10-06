using HidSharp;

namespace FanFlowHardwareHelper;

/// Uploads images / animations to the TFT screen of keyboards built on the Sonix / HFD
/// "RKGK890" board (USB 0C45:8009: Ajazz AK820 Pro / AKS075, Monka KG991W and rebrands)
/// and syncs their clock. All of them run variants of the same OEM DeviceDriver.exe.
///
/// Two vendor HID interfaces, both only exposed over the USB cable:
///   control  usage page 0xFF13  64-byte feature reports   commands
///   data     usage page 0xFF68  4096-byte output reports  image payload, 64-byte ACK back
///
/// Command = feature report [04 cmd sub 00 00 00 00 00 p8 p9 00 …] (report ID 0 prepended),
/// each followed by a GET_FEATURE handshake and ~40 ms pause.
///
/// Image upload: START (04 18) → IMAGE_CFG (04 72 slot, bytes 8-9 = chunk count LE) →
/// 4096-byte chunks, each followed by reading the ACK → SAVE (04 02). No FINISH (04 F0):
/// it breaks persistence. Payload = 256-byte header [frames, delay/2 ms per frame, FF…]
/// + frames of RGB565 little-endian, padded with FF to a whole chunk.
///
/// The boards share VID/PID but not the panel, so the screen size comes from a model
/// profile; sending frames sized for another panel would scramble what gets stored.
internal sealed class KeyboardScreen
{
    public const int MaxFrames = 255;

    /// timeStartFlag / timeByte10: the clock packets differ slightly between drivers.
    public sealed record Model(string Id, int Width, int Height, byte ImageSlot, bool TimeStartFlag, bool TimeByte10)
    {
        public int FrameBytes => Width * Height * 2;
    }

    /// Ajazz: from the USB capture in github.com/aar-rafi/aks075-linux (MIT).
    /// Monka KG991W: from its official driver (MONKA_KG991W_Gasket_Keybord_V1.1), where the
    /// upload routine renders 160x80 frames (0x6400 bytes) and the slot is the selected
    /// screen item + 1.
    public static readonly IReadOnlyDictionary<string, Model> Models = new Dictionary<string, Model>
    {
        ["ajazz128"] = new("ajazz128", 128, 128, ImageSlot: 0x03, TimeStartFlag: true, TimeByte10: true),
        ["monka160x80"] = new("monka160x80", 160, 80, ImageSlot: 0x01, TimeStartFlag: false, TimeByte10: false),
    };

    private const int VendorId = 0x0C45;
    private const int ProductId = 0x8009;
    private const uint ControlUsagePage = 0xFF13;
    private const uint DataUsagePage = 0xFF68;
    private const int CommandLength = 64;
    private const int ChunkLength = 4096;
    private const int HeaderLength = 256;
    private static readonly TimeSpan CommandDelay = TimeSpan.FromMilliseconds(40);
    private static readonly TimeSpan ChunkDelay = TimeSpan.FromMilliseconds(8);
    private static readonly TimeSpan DetectInterval = TimeSpan.FromSeconds(5);

    private const byte CmdPrefix = 0x04;
    private const byte CmdSave = 0x02;
    private const byte CmdStart = 0x18;
    private const byte CmdTime = 0x28;
    private const byte CmdImage = 0x72;

    private readonly object _lock = new();
    private readonly object _detectLock = new();
    private (HidDevice control, HidDevice data)? _device;
    private string? _productName;
    private DateTime _nextDetect = DateTime.MinValue;
    private bool _wasConnected;
    private volatile bool _autoSyncTime = true;
    private volatile string? _configuredModel;
    private volatile bool _busy;

    public bool Busy => _busy;

    /// USB product string of the connected keyboard, as reported by its firmware.
    public string? ProductName
    {
        get { lock (_detectLock) return _productName; }
    }

    /// Best guess from the product string; null when it doesn't name a known model.
    public string? SuggestedModel => Suggest(ProductName);

    private static string? Suggest(string? product)
    {
        if (product is null) return null;
        if (product.Contains("KG991", StringComparison.OrdinalIgnoreCase)) return "monka160x80";
        if (product.Contains("AK820", StringComparison.OrdinalIgnoreCase) ||
            product.Contains("AKS075", StringComparison.OrdinalIgnoreCase)) return "ajazz128";
        return null;
    }

    /// model: the screen the user picked in the app, or null to rely on detection.
    public void Configure(bool autoSyncTime, string? model)
    {
        _autoSyncTime = autoSyncTime;
        _configuredModel = model is not null && Models.ContainsKey(model) ? model : null;
    }

    /// Called from the sensor loop. Re-enumerates at most every few seconds and, when a
    /// keyboard of a known model is newly plugged in, sets its clock (the screen's default
    /// face is a clock that drifts or resets without the vendor app running).
    public bool Poll()
    {
        bool connected;
        bool justConnected;
        lock (_detectLock)
        {
            if (DateTime.UtcNow >= _nextDetect && !_busy)
            {
                _nextDetect = DateTime.UtcNow + DetectInterval;
                try
                {
                    _device = Find();
                    _productName = _device is null ? null : TryGetProductName(_device.Value.control);
                }
                catch
                {
                    // never let keyboard detection break the sensor updates
                    _device = null;
                    _productName = null;
                }
            }
            connected = _device is not null;
            justConnected = connected && !_wasConnected;
            _wasConnected = connected;
        }

        string? model = _configuredModel ?? SuggestedModel;
        if (justConnected && _autoSyncTime && model is not null)
        {
            Task.Run(() =>
            {
                try
                {
                    SyncTime(model);
                }
                catch
                {
                    // best-effort; the user can retry from the app
                }
            });
        }
        return connected;
    }

    private static string? TryGetProductName(HidDevice device)
    {
        try
        {
            string name = device.GetProductName()?.Trim() ?? "";
            return name.Length > 0 ? name : null;
        }
        catch
        {
            return null;
        }
    }

    /// The same VID/PID is shared by Sonix keyboards without a screen, so require both
    /// vendor interfaces with the exact report sizes the screen protocol uses.
    private static (HidDevice control, HidDevice data)? Find()
    {
        HidDevice? control = null;
        HidDevice? data = null;
        foreach (var device in DeviceList.Local.GetHidDevices(VendorId, ProductId))
        {
            try
            {
                uint? page = UsagePage(device);
                if (page == ControlUsagePage && device.GetMaxFeatureReportLength() >= CommandLength + 1)
                    control ??= device;
                else if (page == DataUsagePage && device.GetMaxOutputReportLength() >= ChunkLength + 1)
                    data ??= device;
            }
            catch
            {
                // interface without a readable descriptor (the OS owns the keyboard ones)
            }
        }
        return control is not null && data is not null ? (control, data) : null;
    }

    private static uint? UsagePage(HidDevice device)
    {
        foreach (var item in device.GetReportDescriptor().DeviceItems)
        {
            foreach (uint usage in item.Usages.GetAllValues())
                return usage >> 16;
        }
        return null;
    }

    private static Model Resolve(string modelId) =>
        Models.TryGetValue(modelId, out var model) ? model : throw new ArgumentException("unknown-model");

    public void SyncTime(string modelId)
    {
        var model = Resolve(modelId);
        var now = DateTime.Now;
        RunExclusive((control, _) =>
        {
            SendCommand(control, CmdStart, enable: model.TimeStartFlag);
            SendCommand(control, CmdTime, enable: true);
            Handshake(control);

            var data = new byte[CommandLength];
            data[0] = 0x00;
            data[1] = 0x01;
            data[2] = 0x5A;
            data[3] = (byte)(now.Year - 2000);
            data[4] = (byte)now.Month;
            data[5] = (byte)now.Day;
            data[6] = (byte)now.Hour;
            data[7] = (byte)now.Minute;
            data[8] = (byte)now.Second;
            if (model.TimeByte10) data[10] = 0x04;
            data[62] = 0xAA;
            data[63] = 0x55;
            SetFeature(control, data);
            Thread.Sleep(CommandDelay);

            SendCommand(control, CmdSave, enable: false);
            Handshake(control);
        });
    }

    /// frames: frameCount × model.FrameBytes of RGB565 LE pixels; delaysMs: one per frame.
    public void Upload(string modelId, byte[] frames, IReadOnlyList<int> delaysMs, Action<int, int> progress)
    {
        var model = Resolve(modelId);
        int frameCount = frames.Length / model.FrameBytes;
        if (frameCount < 1 || frameCount > MaxFrames || frames.Length != frameCount * model.FrameBytes)
            throw new ArgumentException("invalid-frames");

        var header = new byte[HeaderLength];
        Array.Fill(header, (byte)0xFF);
        header[0] = (byte)frameCount;
        if (frameCount == 1)
        {
            header[1] = 0x00;
        }
        else
        {
            for (int i = 0; i < frameCount; i++)
            {
                int delay = i < delaysMs.Count ? delaysMs[i] : 100;
                header[1 + i] = (byte)Math.Clamp(delay / 2, 1, 255);
            }
        }

        int chunks = (HeaderLength + frames.Length + ChunkLength - 1) / ChunkLength;
        var payload = new byte[chunks * ChunkLength];
        Array.Fill(payload, (byte)0xFF);
        header.CopyTo(payload, 0);
        frames.CopyTo(payload, HeaderLength);

        RunExclusive((control, data) =>
        {
            SendCommand(control, CmdStart, enable: false);
            Handshake(control);

            var config = Command(CmdImage, model.ImageSlot, enable: false);
            config[8] = (byte)(chunks & 0xFF);
            config[9] = (byte)(chunks >> 8);
            SetFeature(control, config);
            Handshake(control);

            int reportLength = data.GetMaxOutputReportLength();
            int ackLength = Math.Max(data.GetMaxInputReportLength(), CommandLength + 1);
            using var stream = data.Open();
            stream.ReadTimeout = 300;
            var report = new byte[reportLength];
            var ack = new byte[ackLength];
            for (int i = 0; i < chunks; i++)
            {
                Array.Clear(report);
                Buffer.BlockCopy(payload, i * ChunkLength, report, 1, ChunkLength);
                Thread.Sleep(ChunkDelay);
                stream.Write(report);
                // The vendor driver reads an ACK after every chunk; without it the data
                // never makes it to flash.
                try
                {
                    stream.Read(ack);
                }
                catch (TimeoutException)
                {
                }
                progress(i + 1, chunks);
            }

            SendCommand(control, CmdSave, enable: false);
            Handshake(control);
        });
    }

    private void RunExclusive(Action<HidDevice, HidDevice> action)
    {
        lock (_lock)
        {
            (HidDevice control, HidDevice data)? device;
            lock (_detectLock)
            {
                _device ??= Find();
                device = _device;
            }
            if (device is null) throw new InvalidOperationException("keyboard-not-found");

            _busy = true;
            try
            {
                action(device.Value.control, device.Value.data);
            }
            catch
            {
                lock (_detectLock) _device = null;
                throw;
            }
            finally
            {
                _busy = false;
            }
        }
    }

    private static byte[] Command(byte cmd, byte sub, bool enable)
    {
        var packet = new byte[CommandLength];
        packet[0] = CmdPrefix;
        packet[1] = cmd;
        packet[2] = sub;
        if (enable) packet[8] = 0x01;
        return packet;
    }

    private static void SendCommand(HidDevice control, byte cmd, bool enable)
    {
        SetFeature(control, Command(cmd, 0x00, enable));
        if (cmd == CmdStart) Thread.Sleep(CommandDelay);
    }

    private static void SetFeature(HidDevice control, byte[] payload)
    {
        var buffer = new byte[control.GetMaxFeatureReportLength()];
        buffer[0] = 0x00; // the device declares no report IDs
        Buffer.BlockCopy(payload, 0, buffer, 1, Math.Min(payload.Length, buffer.Length - 1));
        using var stream = control.Open();
        stream.SetFeature(buffer);
    }

    /// The device echoes the command back as an acknowledgement; failures are harmless.
    private static void Handshake(HidDevice control)
    {
        try
        {
            var buffer = new byte[control.GetMaxFeatureReportLength()];
            using var stream = control.Open();
            stream.GetFeature(buffer);
        }
        catch
        {
        }
        Thread.Sleep(CommandDelay);
    }
}
