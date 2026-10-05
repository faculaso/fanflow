using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace FanFlowHardwareHelper;

/// RAM statistics and the same memory-list purges tools like QuickCPU / RAMMap expose.
/// Everything here needs the helper to run elevated (it does: requireAdministrator).
internal static class MemoryCleaner
{
    // NtSetSystemInformation / NtQuerySystemInformation classes and commands.
    private const int SystemMemoryListInformation = 80;
    private const int MemoryEmptyWorkingSets = 2;
    private const int MemoryFlushModifiedList = 3;
    private const int MemoryPurgeStandbyList = 4;
    private const int MemoryPurgeLowPriorityStandbyList = 5;

    private static bool _privilegesEnabled;

    public static readonly string[] AllOperations =
        ["workingSets", "fileCache", "modified", "lowStandby", "standby"];

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhys;
        public ulong AvailPhys;
        public ulong TotalPageFile;
        public ulong AvailPageFile;
        public ulong TotalVirtual;
        public ulong AvailVirtual;
        public ulong AvailExtendedVirtual;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SystemMemoryListInfo
    {
        public nuint ZeroPageCount;
        public nuint FreePageCount;
        public nuint ModifiedPageCount;
        public nuint ModifiedNoWritePageCount;
        public nuint BadPageCount;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
        public nuint[] PageCountByPriority;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
        public nuint[] RepurposedPagesByPriority;
        public nuint ModifiedPageCountPageFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetSystemFileCacheSize(nint minimumFileCacheSize, nint maximumFileCacheSize, int flags);

    [DllImport("ntdll.dll")]
    private static extern int NtSetSystemInformation(int infoClass, ref int info, int length);

    [DllImport("ntdll.dll")]
    private static extern int NtQuerySystemInformation(int infoClass, nint info, int length, out int returnLength);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(nint process, uint access, out nint token);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool LookupPrivilegeValue(string? system, string name, out long luid);

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct TokenPrivileges
    {
        public uint Count;
        public long Luid;
        public uint Attributes;
    }

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AdjustTokenPrivileges(
        nint token, bool disableAll, ref TokenPrivileges state, int length, nint previous, nint returnLength);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);

    [DllImport("kernel32.dll")]
    private static extern nint GetCurrentProcess();

    /// Purging memory lists needs SeProfileSingleProcessPrivilege and the file cache needs
    /// SeIncreaseQuotaPrivilege. Admin tokens hold both, but disabled until asked for.
    private static void EnsurePrivileges()
    {
        if (_privilegesEnabled) return;
        const uint TokenAdjustPrivileges = 0x20;
        const uint TokenQuery = 0x8;
        const uint SePrivilegeEnabled = 0x2;

        if (!OpenProcessToken(GetCurrentProcess(), TokenAdjustPrivileges | TokenQuery, out nint token))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            foreach (var name in new[] { "SeProfileSingleProcessPrivilege", "SeIncreaseQuotaPrivilege" })
            {
                if (!LookupPrivilegeValue(null, name, out long luid)) continue;
                var tp = new TokenPrivileges { Count = 1, Luid = luid, Attributes = SePrivilegeEnabled };
                AdjustTokenPrivileges(token, false, ref tp, 0, 0, 0);
            }
        }
        finally
        {
            CloseHandle(token);
        }
        _privilegesEnabled = true;
    }

    public static JsonObject? GetStats()
    {
        var status = new MemoryStatusEx { Length = (uint)Marshal.SizeOf<MemoryStatusEx>() };
        if (!GlobalMemoryStatusEx(ref status)) return null;

        var stats = new JsonObject
        {
            ["total"] = status.TotalPhys,
            ["available"] = status.AvailPhys,
            ["load"] = status.MemoryLoad,
        };

        // The standby/modified/free breakdown is best-effort; without it the UI still
        // shows used vs. available.
        try
        {
            EnsurePrivileges();
            int size = Marshal.SizeOf<SystemMemoryListInfo>();
            nint buffer = Marshal.AllocHGlobal(size);
            try
            {
                if (NtQuerySystemInformation(SystemMemoryListInformation, buffer, size, out _) == 0)
                {
                    var info = Marshal.PtrToStructure<SystemMemoryListInfo>(buffer);
                    ulong pageSize = (ulong)Environment.SystemPageSize;
                    ulong standby = 0;
                    foreach (var count in info.PageCountByPriority) standby += count;
                    stats["standby"] = standby * pageSize;
                    stats["modified"] = (ulong)info.ModifiedPageCount * pageSize;
                    stats["free"] = ((ulong)info.FreePageCount + (ulong)info.ZeroPageCount) * pageSize;
                }
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        catch
        {
            // breakdown unavailable
        }

        return stats;
    }

    private static (ulong available, ulong? free) Snapshot()
    {
        var stats = GetStats();
        ulong available = stats?["available"]?.GetValue<ulong>() ?? 0;
        ulong? free = stats?["free"]?.GetValue<ulong>();
        return (available, free);
    }

    private static void RunMemoryListCommand(int command)
    {
        int value = command;
        int ntStatus = NtSetSystemInformation(SystemMemoryListInformation, ref value, sizeof(int));
        if (ntStatus != 0) throw new InvalidOperationException($"NTSTATUS 0x{ntStatus:X8}");
    }

    private static void Run(string operation)
    {
        switch (operation)
        {
            case "workingSets":
                RunMemoryListCommand(MemoryEmptyWorkingSets);
                break;
            case "fileCache":
                if (!SetSystemFileCacheSize(-1, -1, 0))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                break;
            case "modified":
                RunMemoryListCommand(MemoryFlushModifiedList);
                break;
            case "lowStandby":
                RunMemoryListCommand(MemoryPurgeLowPriorityStandbyList);
                break;
            case "standby":
                RunMemoryListCommand(MemoryPurgeStandbyList);
                break;
            default:
                throw new ArgumentException($"Operación desconocida: {operation}");
        }
    }

    /// Runs the requested purges in a fixed, sensible order (trim working sets first so
    /// their pages land on the lists that the later purges then release).
    public static JsonObject Clean(IEnumerable<string> requested)
    {
        var wanted = new HashSet<string>(requested);
        var results = new JsonArray();
        var before = Snapshot();

        try
        {
            EnsurePrivileges();
        }
        catch (Exception ex)
        {
            return new JsonObject
            {
                ["ok"] = false, ["error"] = ex.Message, ["freed"] = 0, ["availableGained"] = 0, ["results"] = results,
            };
        }

        foreach (var operation in AllOperations)
        {
            if (!wanted.Contains(operation)) continue;
            try
            {
                Run(operation);
                results.Add(new JsonObject { ["op"] = operation, ["ok"] = true });
            }
            catch (Exception ex)
            {
                results.Add(new JsonObject { ["op"] = operation, ["ok"] = false, ["error"] = ex.Message });
            }
        }

        var after = Snapshot();
        // Purging standby turns cache into free pages without changing "available"
        // (Windows already counts standby as available), so report both deltas.
        static ulong Delta(ulong a, ulong b) => b > a ? b - a : 0;
        return new JsonObject
        {
            ["ok"] = true,
            ["freed"] = before.free is ulong f0 && after.free is ulong f1
                ? Delta(f0, f1)
                : Delta(before.available, after.available),
            ["availableGained"] = Delta(before.available, after.available),
            ["results"] = results,
        };
    }
}
