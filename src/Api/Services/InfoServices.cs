using System.Net;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.Services;

public sealed class TtlCache<T>(TimeSpan ttl, TimeProvider time)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private T? _value;
    private DateTimeOffset _expires;

    public async Task<T> GetAsync(Func<CancellationToken, Task<T>> factory, CancellationToken cancellationToken)
    {
        if (_value is not null && time.GetUtcNow() < _expires)
        {
            return _value;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_value is not null && time.GetUtcNow() < _expires)
            {
                return _value;
            }

            _value = await factory(cancellationToken);
            _expires = time.GetUtcNow() + ttl;
            return _value;
        }
        finally
        {
            _gate.Release();
        }
    }
}

public sealed class NetworkInfoService(
    IOptions<LookingGlassOptions> options,
    IDiagnosticsClient diagnostics,
    TimeProvider time)
{
    private readonly TtlCache<EgressAddresses> _egress = new(TimeSpan.FromSeconds(30), time);

    public async Task<NetworkInfoResponse> GetAsync(CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var ipv4 = Normalise(settings.Ipv4, System.Net.Sockets.AddressFamily.InterNetwork);
        var ipv6 = Normalise(settings.Ipv6, System.Net.Sockets.AddressFamily.InterNetworkV6);

        if (ipv4 is null || ipv6 is null)
        {
            try
            {
                var discovered = await _egress.GetAsync(diagnostics.GetEgressAsync, cancellationToken);
                ipv4 ??= discovered.Ipv4;
                ipv6 ??= discovered.Ipv6;
            }
            catch (LookingGlassException)
            {
            }
        }

        return new NetworkInfoResponse
        {
            Location = settings.Location,
            Hostname = settings.Hostname,
            Ipv4 = ipv4,
            Ipv6 = ipv6,
            Asn = NormaliseAsn(settings.Asn),
            Network = settings.Network,
            Version = HostingExtensions.ApplicationVersion,
        };
    }

    private static string? Normalise(string? value, System.Net.Sockets.AddressFamily family) =>
        IPAddress.TryParse(value, out var ip) && ip.AddressFamily == family ? ip.ToString() : null;

    private static string? NormaliseAsn(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = value.Trim().StartsWith("AS", StringComparison.OrdinalIgnoreCase) ? value.Trim()[2..] : value.Trim();
        return uint.TryParse(digits, out var asn) ? $"AS{asn}" : null;
    }
}

public sealed class StatusService(
    IDiagnosticsClient diagnostics,
    IBgpProvider bgp,
    TimeProvider time)
{
    private readonly TtlCache<StatusResponse> _cache = new(TimeSpan.FromSeconds(5), time);

    public Task<StatusResponse> GetAsync(CancellationToken cancellationToken) =>
        _cache.GetAsync(BuildAsync, cancellationToken);

    private async Task<StatusResponse> BuildAsync(CancellationToken cancellationToken)
    {
        var readiness = diagnostics.CheckReadyAsync(cancellationToken);
        var performance = TryGetPerformanceAsync(cancellationToken);
        await Task.WhenAll(readiness, performance);

        var latency = readiness.Result;
        var perf = performance.Result;
        var diagnosticsUp = latency is not null;

        var components = new List<ComponentStatus>
        {
            new() { Id = "web", Name = "Looking Glass", Status = ServiceStatus.Operational },
            new() { Id = "api", Name = "API", Status = ServiceStatus.Operational },
            new()
            {
                Id = "diagnostics",
                Name = "Diagnostics",
                Status = diagnosticsUp ? ServiceStatus.Operational : ServiceStatus.Outage,
                Detail = diagnosticsUp ? null : "The diagnostics service is not responding.",
                LatencyMs = latency is { } l ? Math.Round(l, 1) : null,
            },
            await bgp.GetComponentAsync(cancellationToken),
            Connectivity("ipv4", "IPv4 Connectivity", "IPv4", perf?.Ipv4),
            Connectivity("ipv6", "IPv6 Connectivity", "IPv6", perf?.Ipv6),
        };

        return new StatusResponse
        {
            Overall = Overall(components),
            CheckedAt = time.GetUtcNow(),
            Version = HostingExtensions.ApplicationVersion,
            Components = components,
        };
    }

    private async Task<PerformanceResponse?> TryGetPerformanceAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await diagnostics.GetPerformanceAsync(cancellationToken);
        }
        catch (LookingGlassException)
        {
            return null;
        }
    }

    private static ComponentStatus Connectivity(string id, string name, string label, FamilyPerformance? performance)
    {
        if (performance is null)
        {
            return new ComponentStatus
            {
                Id = id,
                Name = name,
                Status = ServiceStatus.Degraded,
                Detail = "Connectivity measurements are currently unavailable.",
            };
        }

        var detail = performance.Status switch
        {
            ServiceStatus.NotConfigured => $"{label} connectivity monitoring is not configured.",
            ServiceStatus.Outage => $"No {label} connectivity detected.",
            ServiceStatus.Degraded when performance.Samples.Count == 0 => "Waiting for the first measurement.",
            ServiceStatus.Degraded => $"Intermittent {label} connectivity.",
            _ when performance.AvgLatencyMs is { } avg => $"Average latency {avg:0.#} ms",
            _ => null,
        };

        return new ComponentStatus
        {
            Id = id,
            Name = name,
            Status = performance.Status,
            Detail = detail,
            LatencyMs = performance.AvgLatencyMs,
        };
    }

    public static ServiceStatus Overall(IReadOnlyList<ComponentStatus> components)
    {
        var core = components.Where(c => c.Id is "web" or "api" or "diagnostics").Select(c => c.Status).ToList();
        if (core.Contains(ServiceStatus.Outage))
        {
            return ServiceStatus.Outage;
        }

        var ip = components.Where(c => c.Id is "ipv4" or "ipv6" && c.Status != ServiceStatus.NotConfigured).ToList();
        if (ip.Count > 0 && ip.All(c => c.Status == ServiceStatus.Outage))
        {
            return ServiceStatus.Outage;
        }

        var rest = components.Where(c => c.Status != ServiceStatus.NotConfigured).Select(c => c.Status);
        return rest.Any(s => s != ServiceStatus.Operational) ? ServiceStatus.Degraded : ServiceStatus.Operational;
    }
}

public interface IBgpProvider
{
    Task<ComponentStatus> GetComponentAsync(CancellationToken cancellationToken);

    Task<T> QueryAsync<T>(string operation, string? argument, CancellationToken cancellationToken);
}

public sealed class DisabledBgpProvider(IOptions<BgpOptions> options) : IBgpProvider
{
    public Task<ComponentStatus> GetComponentAsync(CancellationToken cancellationToken) =>
        Task.FromResult(new ComponentStatus
        {
            Id = "bgp",
            Name = "BGP",
            Status = options.Value.Enabled ? ServiceStatus.Outage : ServiceStatus.NotConfigured,
            Detail = options.Value.Enabled
                ? "BGP is enabled but no BGP provider is available."
                : "BGP is not enabled on this Looking Glass.",
        });

    public Task<T> QueryAsync<T>(string operation, string? argument, CancellationToken cancellationToken) =>
        throw new LookingGlassException(
            ProblemCodes.BgpUnavailable,
            503,
            "BGP information is currently unavailable. The Looking Glass is still operational.");
}
