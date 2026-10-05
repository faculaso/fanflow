using HidSharp;

namespace FanFlowHardwareHelper;

/// Drives the 2-digit temperature display on Redragon / CSM / Alseye style CPU coolers
/// (USB HID 5131:2007, vendor usage page 0xFF00). The firmware shows whatever number the
/// host last sent, so it must be refreshed continuously; one 65-byte output report:
///
///   byte 0   0x00   report ID
///   byte 1   0x40   command (constant)
///   byte 2   temp   degrees Celsius, 0-99
///   byte 3+  0x00   unused by the 2-digit panel
internal sealed class CoolerDisplay
{
    private const int VendorId = 0x5131;
    private const int ProductId = 0x2007;
    private const byte Command = 0x40;
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ReconnectInterval = TimeSpan.FromSeconds(5);

    private readonly object _lock = new();
    private HidStream? _stream;
    private int _reportLength = 65;
    private DateTime _nextConnectAttempt = DateTime.MinValue;

    private volatile bool _enabled = true;
    private volatile string _source = "cpu";
    private float? _cpuTemp;
    private float? _gpuTemp;

    public bool Connected
    {
        get { lock (_lock) return _stream is not null; }
    }

    public void Configure(bool enabled, string source)
    {
        _enabled = enabled;
        _source = source == "gpu" ? "gpu" : "cpu";
    }

    public void SetTemps(float? cpuTemp, float? gpuTemp)
    {
        lock (_lock)
        {
            _cpuTemp = cpuTemp;
            _gpuTemp = gpuTemp;
        }
    }

    /// Runs on its own thread: the sensor loop ticks every 1.5 s, slower than the
    /// panel's expected ~1 s refresh, so the last known value is resent independently.
    public void Run(Func<bool> shouldStop)
    {
        while (!shouldStop())
        {
            try
            {
                Tick();
            }
            catch
            {
                Disconnect();
            }
            Thread.Sleep(RefreshInterval);
        }
        Disconnect();
    }

    private void Tick()
    {
        if (!_enabled) return;

        lock (_lock)
        {
            if (_stream is null && !TryConnect()) return;

            float? temp = _source == "gpu" ? _gpuTemp : _cpuTemp;
            if (temp is null) return;

            var report = new byte[_reportLength];
            report[0] = 0x00;
            report[1] = Command;
            report[2] = (byte)Math.Clamp((int)Math.Round(temp.Value), 0, 99);
            _stream!.Write(report);
        }
    }

    private bool TryConnect()
    {
        if (DateTime.UtcNow < _nextConnectAttempt) return false;
        _nextConnectAttempt = DateTime.UtcNow + ReconnectInterval;

        var device = DeviceList.Local.GetHidDevices(VendorId, ProductId).FirstOrDefault();
        if (device is null || !device.TryOpen(out HidStream stream)) return false;

        int length = device.GetMaxOutputReportLength();
        _reportLength = length >= 3 ? length : 65;
        _stream = stream;
        return true;
    }

    private void Disconnect()
    {
        lock (_lock)
        {
            try
            {
                _stream?.Dispose();
            }
            catch
            {
                // device already gone
            }
            _stream = null;
        }
    }
}
