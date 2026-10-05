using System.Security.Principal;
using System.Text.Json.Nodes;
using LibreHardwareMonitor.Hardware;

namespace FanFlowHardwareHelper;

internal static class Program
{
    private static Computer? _computer;
    private static readonly object ComputerLock = new();
    private static volatile bool _shuttingDown;
    private static readonly CoolerDisplay Display = new();

    private static void Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Out.NewLine = "\n";

        AppDomain.CurrentDomain.ProcessExit += (_, _) => ReleaseAllControls();
        Console.CancelKeyPress += (_, _) => ReleaseAllControls();

        bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent())
            .IsInRole(WindowsBuiltInRole.Administrator);

        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMotherboardEnabled = true,
            IsControllerEnabled = true,
        };

        try
        {
            _computer.Open();
        }
        catch (Exception ex)
        {
            Emit(new JsonObject
            {
                ["type"] = "status",
                ["admin"] = isAdmin,
                ["ok"] = false,
                ["error"] = ex.Message,
            });
            return;
        }

        Emit(new JsonObject { ["type"] = "status", ["admin"] = isAdmin, ["ok"] = true });
        EmitDiagnostics();

        var stdinThread = new Thread(ReadCommands) { IsBackground = true };
        stdinThread.Start();

        var displayThread = new Thread(() => Display.Run(() => _shuttingDown)) { IsBackground = true };
        displayThread.Start();

        while (!_shuttingDown)
        {
            try
            {
                EmitUpdate();
            }
            catch (Exception ex)
            {
                Emit(new JsonObject { ["type"] = "error", ["message"] = ex.Message });
            }
            Thread.Sleep(1500);
        }
    }

    private static void ReadCommands()
    {
        string? line;
        while (!_shuttingDown && (line = Console.In.ReadLine()) != null)
        {
            line = line.Trim();
            if (line.Length == 0) continue;
            try
            {
                HandleCommand(line);
            }
            catch (Exception ex)
            {
                Emit(new JsonObject { ["type"] = "error", ["message"] = ex.Message });
            }
        }
    }

    private static void HandleCommand(string line)
    {
        var node = JsonNode.Parse(line)?.AsObject();
        if (node is null) return;
        string? type = node["type"]?.GetValue<string>();

        if (type == "cleanMemory")
        {
            // Emptying working sets can take a few seconds; keep fan commands flowing.
            string? requestId = node["requestId"]?.GetValue<string>();
            var operations = node["operations"]?.AsArray().Select(o => o!.GetValue<string>()).ToList()
                ?? [.. MemoryCleaner.AllOperations];
            Task.Run(() =>
            {
                var result = MemoryCleaner.Clean(operations);
                result["type"] = "memoryCleaned";
                result["requestId"] = requestId;
                Emit(result);
            });
            return;
        }

        if (type == "setDisplay")
        {
            Display.Configure(
                node["enabled"]?.GetValue<bool>() ?? true,
                node["source"]?.GetValue<string>() ?? "cpu");
            return;
        }

        lock (ComputerLock)
        {
            switch (type)
            {
                case "setPercent":
                {
                    string? id = node["id"]?.GetValue<string>();
                    double? percent = node["percent"]?.GetValue<double>();
                    if (id is null || percent is null) return;
                    var control = FindControl(id);
                    control?.SetSoftware((float)Math.Clamp(percent.Value, 0, 100));
                    break;
                }
                case "setAuto":
                {
                    string? id = node["id"]?.GetValue<string>();
                    if (id is null) return;
                    var control = FindControl(id);
                    control?.SetDefault();
                    break;
                }
                case "shutdown":
                {
                    ReleaseAllControls();
                    _shuttingDown = true;
                    Environment.Exit(0);
                    break;
                }
            }
        }
    }

    private static IControl? FindControl(string identifier)
    {
        if (_computer is null) return null;
        foreach (var hardware in AllHardware(_computer))
        {
            hardware.Update();
            foreach (var sensor in hardware.Sensors)
            {
                if (sensor.SensorType == SensorType.Control &&
                    sensor.Control is not null &&
                    sensor.Identifier.ToString() == identifier)
                {
                    return sensor.Control;
                }
            }
        }
        return null;
    }

    private static void ReleaseAllControls()
    {
        if (_computer is null || _shuttingDown) return;
        try
        {
            lock (ComputerLock)
            {
                foreach (var hardware in AllHardware(_computer))
                {
                    foreach (var sensor in hardware.Sensors)
                    {
                        if (sensor.SensorType == SensorType.Control && sensor.Control is not null)
                        {
                            sensor.Control.SetDefault();
                        }
                    }
                }
                _computer.Close();
            }
        }
        catch
        {
            // best-effort on shutdown
        }
    }

    private static IEnumerable<IHardware> AllHardware(IComputer computer)
    {
        foreach (var hardware in computer.Hardware)
        {
            yield return hardware;
            foreach (var sub in hardware.SubHardware)
            {
                yield return sub;
            }
        }
    }

    private static void EmitUpdate()
    {
        if (_computer is null) return;

        lock (ComputerLock)
        {
            foreach (var hardware in AllHardware(_computer))
            {
                hardware.Update();
            }
        }

        float? cpuTemp = null;
        float? cpuLoad = null;
        float? gpuTemp = null;
        float? gpuLoad = null;
        string? gpuName = null;
        var boardTemps = new JsonArray();
        var fansOut = new JsonArray();

        foreach (var hardware in _computer.Hardware)
        {
            if (hardware.HardwareType == HardwareType.Cpu)
            {
                foreach (var sensor in hardware.Sensors)
                {
                    if (sensor.SensorType == SensorType.Temperature && IsValidTemp(sensor.Value))
                    {
                        if (sensor.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) || cpuTemp is null)
                            cpuTemp = sensor.Value ?? cpuTemp;
                    }
                    else if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Total", StringComparison.OrdinalIgnoreCase))
                    {
                        cpuLoad = sensor.Value;
                    }
                }
            }
            else if (hardware.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel)
            {
                gpuName ??= hardware.Name;
                foreach (var sensor in hardware.Sensors)
                {
                    if (sensor.SensorType == SensorType.Temperature && IsValidTemp(sensor.Value) &&
                        (sensor.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) || gpuTemp is null))
                    {
                        gpuTemp = sensor.Value ?? gpuTemp;
                    }
                    else if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Core", StringComparison.OrdinalIgnoreCase))
                    {
                        gpuLoad = sensor.Value;
                    }
                }
                // GPUs expose their own fan (RPM + writable duty cycle) directly via the
                // vendor driver, not through the motherboard's SuperIO like case fans.
                CollectFanChannels(hardware.Sensors, fansOut);
            }
            else if (hardware.HardwareType == HardwareType.Motherboard)
            {
                foreach (var sub in hardware.SubHardware)
                {
                    foreach (var sensor in sub.Sensors)
                    {
                        if (sensor.SensorType == SensorType.Temperature && IsValidTemp(sensor.Value))
                        {
                            boardTemps.Add(new JsonObject
                            {
                                ["id"] = sensor.Identifier.ToString(),
                                ["name"] = sensor.Name,
                                ["value"] = sensor.Value,
                            });
                        }
                    }
                    CollectFanChannels(sub.Sensors, fansOut);
                }
            }
        }

        Display.SetTemps(cpuTemp, gpuTemp);

        Emit(new JsonObject
        {
            ["type"] = "update",
            ["cpu"] = new JsonObject { ["temp"] = cpuTemp, ["load"] = cpuLoad },
            ["gpu"] = new JsonObject { ["temp"] = gpuTemp, ["load"] = gpuLoad, ["name"] = gpuName },
            ["board"] = new JsonObject { ["temps"] = boardTemps },
            ["fans"] = fansOut,
            ["display"] = new JsonObject { ["connected"] = Display.Connected },
            ["memory"] = MemoryCleaner.GetStats(),
        });
    }

    /// Pairs Fan (RPM) and Control (duty cycle) sensors that share the same Index within
    /// one piece of hardware and appends them to the output list. Each hardware component
    /// (a SuperIO chip, a GPU) numbers its own fan headers starting from 0, so this must be
    /// called once per hardware with a fresh index scope rather than reusing one dictionary
    /// across components, or unrelated fans would incorrectly get merged.
    private static void CollectFanChannels(IEnumerable<ISensor> sensors, JsonArray fansOut)
    {
        var channels = new Dictionary<int, (ISensor? fan, ISensor? control)>();
        foreach (var sensor in sensors)
        {
            if (sensor.SensorType == SensorType.Fan)
            {
                var entry = channels.TryGetValue(sensor.Index, out var existing) ? existing : (null, null);
                channels[sensor.Index] = (sensor, entry.control);
            }
            else if (sensor.SensorType == SensorType.Control && sensor.Control is not null)
            {
                var entry = channels.TryGetValue(sensor.Index, out var existing) ? existing : (null, null);
                channels[sensor.Index] = (entry.fan, sensor);
            }
        }

        foreach (var (index, channel) in channels.OrderBy(kv => kv.Key))
        {
            var (fan, control) = channel;
            if (fan is null && control is null) continue;
            string id = (control ?? fan)!.Identifier.ToString();
            string name = fan?.Name ?? control?.Name ?? $"Fan #{index}";
            fansOut.Add(new JsonObject
            {
                ["id"] = id,
                ["name"] = name,
                ["rpm"] = fan?.Value,
                ["percent"] = control?.Value,
                ["controllable"] = control is not null,
            });
        }
    }

    /// Sensor reads that fail silently (missing driver access) often report exactly 0
    /// instead of null; real temperatures never sit at or below freezing in a running PC.
    private static bool IsValidTemp(float? value) => value is > 1f and < 130f;

    /// One-shot dump of the full hardware/sensor tree so a failure to detect CPU temp or
    /// fan headers can be diagnosed (driver load failure vs. naming vs. genuinely absent).
    private static void EmitDiagnostics()
    {
        if (_computer is null) return;
        try
        {
            var hardwareList = new JsonArray();
            foreach (var hardware in _computer.Hardware)
            {
                hardware.Update();
                var subList = new JsonArray();
                foreach (var sub in hardware.SubHardware)
                {
                    sub.Update();
                    var subSensors = new JsonArray();
                    foreach (var s in sub.Sensors)
                    {
                        subSensors.Add(new JsonObject
                        {
                            ["name"] = s.Name,
                            ["sensorType"] = s.SensorType.ToString(),
                            ["value"] = s.Value,
                            ["index"] = s.Index,
                        });
                    }
                    subList.Add(new JsonObject
                    {
                        ["name"] = sub.Name,
                        ["hardwareType"] = sub.HardwareType.ToString(),
                        ["sensors"] = subSensors,
                    });
                }

                var sensors = new JsonArray();
                foreach (var s in hardware.Sensors)
                {
                    sensors.Add(new JsonObject
                    {
                        ["name"] = s.Name,
                        ["sensorType"] = s.SensorType.ToString(),
                        ["value"] = s.Value,
                        ["index"] = s.Index,
                    });
                }

                hardwareList.Add(new JsonObject
                {
                    ["name"] = hardware.Name,
                    ["hardwareType"] = hardware.HardwareType.ToString(),
                    ["sensors"] = sensors,
                    ["subHardware"] = subList,
                });
            }

            var diag = new JsonObject { ["type"] = "diag", ["hardware"] = hardwareList };
            Emit(diag);

            try
            {
                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FanFlow");
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "diagnostics.json"), diag.ToJsonString());
            }
            catch
            {
                // best-effort; the stdout copy already went out
            }
        }
        catch (Exception ex)
        {
            Emit(new JsonObject { ["type"] = "diag", ["error"] = ex.Message });
        }
    }

    private static readonly object EmitLock = new();

    private static void Emit(JsonNode payload)
    {
        // Memory cleaning reports from a worker thread; keep each JSON line intact.
        lock (EmitLock)
        {
            Console.WriteLine(payload.ToJsonString());
            Console.Out.Flush();
        }
    }
}
