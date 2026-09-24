using System.ComponentModel.DataAnnotations;

namespace GeiseIT.LookingGlass.Api;

public sealed class LookingGlassOptions
{
    public const string Section = "LookingGlass";

    public string Location { get; set; } = "GeiseIT Network";

    public string Hostname { get; set; } = "lg.geiseit.com";

    public string? Asn { get; set; }

    public string Network { get; set; } = "GeiseIT";

    public string? Ipv4 { get; set; }

    public string? Ipv6 { get; set; }
}

public sealed class DiagnosticsClientOptions
{
    public const string Section = "Diagnostics";

    [Required]
    public string BaseUrl { get; set; } = "http://localhost:5081";

    [Range(5, 300)]
    public int TimeoutSeconds { get; set; } = 45;
}

public sealed class EndpointLimit
{
    [Range(1, 10000)]
    public int PermitLimit { get; set; }

    [Range(1, 3600)]
    public int WindowSeconds { get; set; } = 60;
}

public sealed class RateLimitingOptions
{
    public const string Section = "RateLimiting";

    public EndpointLimit Ping { get; set; } = new() { PermitLimit = 10 };

    public EndpointLimit Traceroute { get; set; } = new() { PermitLimit = 5 };

    public EndpointLimit Mtr { get; set; } = new() { PermitLimit = 3 };

    public EndpointLimit Dns { get; set; } = new() { PermitLimit = 20 };

    public EndpointLimit Info { get; set; } = new() { PermitLimit = 120 };

    [Range(1, 50)]
    public int MaxConcurrentPerIp { get; set; } = 2;
}

public sealed class NetworkOptions
{
    public const string Section = "Network";

    public string TrustedProxies { get; set; } = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7";

    [Range(1, 5)]
    public int ForwardLimit { get; set; } = 1;
}

public sealed class SecurityOptions
{
    public const string Section = "Security";

    public string? ExtraBlockedCidrs { get; set; }

    public string? ExtraBlockedSuffixes { get; set; }
}

public sealed class ActivityOptions
{
    public const string Section = "Activity";

    public bool Enabled { get; set; } = true;

    [Range(1, 1440)]
    public int RetentionMinutes { get; set; } = 60;

    [Range(1, 100)]
    public int MaxItems { get; set; } = 10;
}

public sealed class BgpOptions
{
    public const string Section = "Bgp";

    public bool Enabled { get; set; }
}
