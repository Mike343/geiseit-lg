using System.Text.Json;
using System.Text.Json.Serialization;

namespace GeiseIT.LookingGlass.Contracts;

public static class LookingGlassJson
{
    public static JsonSerializerOptions Options { get; } = Create();

    public static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,
            PropertyNameCaseInsensitive = true,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        return options;
    }
}

public enum IpFamily
{
    Auto,
    Ipv4,
    Ipv6,
}

public enum IpVersion
{
    Ipv4,
    Ipv6,
}

public enum ServiceStatus
{
    Operational,
    Degraded,
    Outage,
    NotConfigured,
}

public static class DiagnosticTypes
{
    public const string Ping = "ping";
    public const string Traceroute = "traceroute";
    public const string Mtr = "mtr";
    public const string Dns = "dns";
}

public static class DnsRecordTypes
{
    public static readonly IReadOnlyList<string> Supported = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "PTR"];

    public static bool TryNormalize(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var candidate = value.Trim().ToUpperInvariant();
        if (!Supported.Contains(candidate))
        {
            return false;
        }

        normalized = candidate;
        return true;
    }
}

public sealed record DestinationRequest
{
    public string? Destination { get; init; }
    public IpFamily Family { get; init; } = IpFamily.Auto;
}

public sealed record DnsLookupRequest
{
    public string? Name { get; init; }
    public string? RecordType { get; init; } = "A";
}

public sealed record PingReply(int Seq, int? Ttl, double TimeMs);

public sealed record PingResponse
{
    public string RequestId { get; init; } = string.Empty;
    public string Type { get; init; } = DiagnosticTypes.Ping;
    public string Destination { get; init; } = string.Empty;
    public string ResolvedAddress { get; init; } = string.Empty;
    public IpVersion Family { get; init; }
    public DateTimeOffset StartedAt { get; init; }
    public long DurationMs { get; init; }
    public int Transmitted { get; init; }
    public int Received { get; init; }
    public double LossPercent { get; init; }
    public double? MinMs { get; init; }
    public double? AvgMs { get; init; }
    public double? MaxMs { get; init; }
    public double? StdDevMs { get; init; }
    public IReadOnlyList<PingReply> Replies { get; init; } = [];
    public string TechnicalOutput { get; init; } = string.Empty;
    public bool Simulated { get; init; }
}

public sealed record TracerouteHop
{
    public int Hop { get; init; }
    public bool Responded { get; init; }
    public bool Redacted { get; init; }
    public string? Address { get; init; }
    public string? Hostname { get; init; }
    public IReadOnlyList<double?> RttMs { get; init; } = [];
    public double? AvgMs { get; init; }
}

public sealed record TracerouteResponse
{
    public string RequestId { get; init; } = string.Empty;
    public string Type { get; init; } = DiagnosticTypes.Traceroute;
    public string Destination { get; init; } = string.Empty;
    public string ResolvedAddress { get; init; } = string.Empty;
    public IpVersion Family { get; init; }
    public DateTimeOffset StartedAt { get; init; }
    public long DurationMs { get; init; }
    public bool ReachedDestination { get; init; }
    public IReadOnlyList<TracerouteHop> Hops { get; init; } = [];
    public string TechnicalOutput { get; init; } = string.Empty;
    public bool Simulated { get; init; }
}

public sealed record MtrHop
{
    public int Hop { get; init; }
    public bool Responded { get; init; }
    public bool Redacted { get; init; }
    public string? Address { get; init; }
    public string? Hostname { get; init; }
    public double LossPercent { get; init; }
    public int Sent { get; init; }
    public double? LastMs { get; init; }
    public double? AvgMs { get; init; }
    public double? BestMs { get; init; }
    public double? WorstMs { get; init; }
    public double? StdDevMs { get; init; }
}

public sealed record MtrResponse
{
    public string RequestId { get; init; } = string.Empty;
    public string Type { get; init; } = DiagnosticTypes.Mtr;
    public string Destination { get; init; } = string.Empty;
    public string ResolvedAddress { get; init; } = string.Empty;
    public IpVersion Family { get; init; }
    public DateTimeOffset StartedAt { get; init; }
    public long DurationMs { get; init; }
    public int Cycles { get; init; }
    public IReadOnlyList<MtrHop> Hops { get; init; } = [];
    public string TechnicalOutput { get; init; } = string.Empty;
    public bool Simulated { get; init; }
}

public sealed record DnsRecord(string Name, string Type, long Ttl, string Value);

public sealed record DnsResponse
{
    public string RequestId { get; init; } = string.Empty;
    public string Type { get; init; } = DiagnosticTypes.Dns;
    public string Name { get; init; } = string.Empty;
    public string RecordType { get; init; } = string.Empty;
    public DateTimeOffset StartedAt { get; init; }
    public long DurationMs { get; init; }
    public string Status { get; init; } = "ok";
    public IReadOnlyList<DnsRecord> Records { get; init; } = [];
    public string TechnicalOutput { get; init; } = string.Empty;
}

public static class DnsStatuses
{
    public const string Ok = "ok";
    public const string NoData = "nodata";
    public const string NxDomain = "nxdomain";
}

public sealed record ComponentStatus
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public ServiceStatus Status { get; init; }
    public string? Detail { get; init; }
    public double? LatencyMs { get; init; }
}

public sealed record StatusResponse
{
    public ServiceStatus Overall { get; init; }
    public DateTimeOffset CheckedAt { get; init; }
    public string Version { get; init; } = string.Empty;
    public IReadOnlyList<ComponentStatus> Components { get; init; } = [];
}

public sealed record NetworkInfoResponse
{
    public string Brand { get; init; } = "GeiseIT";
    public string Location { get; init; } = string.Empty;
    public string Hostname { get; init; } = string.Empty;
    public string? Ipv4 { get; init; }
    public string? Ipv6 { get; init; }
    public string? Asn { get; init; }
    public string Network { get; init; } = string.Empty;
    public string Platform { get; init; } = "Kubernetes";
    public string Connectivity { get; init; } = "Internet";
    public string Version { get; init; } = string.Empty;
}

public sealed record LatencySample(DateTimeOffset At, double? LatencyMs);

public sealed record FamilyPerformance
{
    public ServiceStatus Status { get; init; }
    public double? AvgLatencyMs { get; init; }
    public double? UptimePercent { get; init; }
    public IReadOnlyList<LatencySample> Samples { get; init; } = [];
}

public sealed record PerformanceResponse
{
    public DateTimeOffset GeneratedAt { get; init; }
    public int WindowSeconds { get; init; }
    public int IntervalSeconds { get; init; }
    public double? AvgLatencyMs { get; init; }
    public double? UptimePercent { get; init; }
    public FamilyPerformance Ipv4 { get; init; } = new();
    public FamilyPerformance Ipv6 { get; init; } = new();
}

public sealed record EgressAddresses(string? Ipv4, string? Ipv6);

public sealed record ActivityItem
{
    public string Type { get; init; } = string.Empty;
    public string Target { get; init; } = string.Empty;
    public string Summary { get; init; } = string.Empty;
    public DateTimeOffset At { get; init; }
}

public sealed record ActivityResponse
{
    public bool Enabled { get; init; }
    public IReadOnlyList<ActivityItem> Items { get; init; } = [];
}

public static class ProblemCodes
{
    public const string ValidationFailed = "validation_failed";
    public const string DestinationBlocked = "destination_blocked";
    public const string RateLimited = "rate_limited";
    public const string Busy = "busy";
    public const string Timeout = "timeout";
    public const string DiagnosticFailed = "diagnostic_failed";
    public const string ServiceUnavailable = "service_unavailable";
    public const string BgpUnavailable = "bgp_unavailable";
    public const string PayloadTooLarge = "payload_too_large";
    public const string UnsupportedMediaType = "unsupported_media_type";
    public const string Cancelled = "cancelled";
    public const string Internal = "internal_error";
}
