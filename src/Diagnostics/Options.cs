using System.ComponentModel.DataAnnotations;

namespace GeiseIT.LookingGlass.Diagnostics;

public sealed class DiagnosticsOptions
{
    public const string Section = "Diagnostics";

    [Range(5, 300)]
    public int TimeoutSeconds { get; set; } = 45;

    [Range(1, 64)]
    public int MaxConcurrent { get; set; } = 4;

    [Range(0, 1024)]
    public int MaxQueued { get; set; } = 16;

    [Range(1, 120)]
    public int QueueWaitSeconds { get; set; } = 10;

    [Range(1024, 4 * 1024 * 1024)]
    public int MaxOutputBytes { get; set; } = 65536;

    public bool RedactPrivateHops { get; set; } = true;

    public bool ReverseDns { get; set; } = true;

    public bool Simulated { get; set; }

    public PingOptions Ping { get; set; } = new();

    public TracerouteOptions Traceroute { get; set; } = new();

    public MtrOptions Mtr { get; set; } = new();

    public ToolPaths Tools { get; set; } = new();
}

public sealed class PingOptions
{
    [Range(1, 20)]
    public int Count { get; set; } = 5;

    [Range(0.2, 5)]
    public double IntervalSeconds { get; set; } = 0.5;

    [Range(1, 10)]
    public int PacketTimeoutSeconds { get; set; } = 2;
}

public sealed class TracerouteOptions
{
    [Range(5, 64)]
    public int MaxHops { get; set; } = 30;

    [Range(1, 5)]
    public int Queries { get; set; } = 3;

    [Range(1, 10)]
    public int WaitSeconds { get; set; } = 2;
}

public sealed class MtrOptions
{
    [Range(1, 30)]
    public int Cycles { get; set; } = 5;

    [Range(1, 5)]
    public int IntervalSeconds { get; set; } = 1;

    [Range(1, 10)]
    public int GraceSeconds { get; set; } = 2;

    [Range(5, 64)]
    public int MaxHops { get; set; } = 30;
}

public sealed class ToolPaths
{
    public string Ping { get; set; } = "/usr/bin/ping";
    public string Traceroute { get; set; } = "/usr/bin/traceroute";
    public string Mtr { get; set; } = "/usr/bin/mtr";
}

public sealed class DnsOptions
{
    public const string Section = "Dns";

    public string Resolvers { get; set; } = "1.1.1.1,9.9.9.9,8.8.8.8";

    [Range(1, 10)]
    public int TimeoutSeconds { get; set; } = 3;

    [Range(0, 3)]
    public int Retries { get; set; } = 1;
}

public sealed class ConnectivityOptions
{
    public const string Section = "Connectivity";

    public bool Enabled { get; set; } = true;

    [Range(5, 3600)]
    public int IntervalSeconds { get; set; } = 60;

    [Range(60, 2592000)]
    public int WindowSeconds { get; set; } = 86400;

    [Range(1, 10)]
    public int ProbeTimeoutSeconds { get; set; } = 3;

    public string Ipv4Targets { get; set; } = "1.1.1.1:443,8.8.8.8:443";

    public string Ipv6Targets { get; set; } = "[2606:4700:4700::1111]:443,[2001:4860:4860::8888]:443";
}

public sealed class EgressOptions
{
    public const string Section = "Egress";

    public bool Enabled { get; set; } = true;

    public string? Ipv4 { get; set; }

    public string? Ipv6 { get; set; }

    public string Ipv4Url { get; set; } = "https://api.ipify.org";

    public string Ipv6Url { get; set; } = "https://api6.ipify.org";

    [Range(1, 1440)]
    public int CacheMinutes { get; set; } = 10;
}

public sealed class SecurityOptions
{
    public const string Section = "Security";

    public string? ExtraBlockedCidrs { get; set; }

    public string? ExtraBlockedSuffixes { get; set; }
}
