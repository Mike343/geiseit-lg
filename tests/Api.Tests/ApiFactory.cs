using GeiseIT.LookingGlass.Api.Services;
using GeiseIT.LookingGlass.Contracts;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace GeiseIT.LookingGlass.Api.Tests;

public sealed class FakeDiagnosticsClient : IDiagnosticsClient
{
    public List<(string Operation, object? Body, string RequestId)> Calls { get; } = [];

    public Func<string, object?, object> Respond { get; set; } = (operation, body) => operation switch
    {
        "ping" => new PingResponse { Destination = ((DestinationRequest)body!).Destination!, ResolvedAddress = "8.8.8.8", Transmitted = 5, Received = 5, AvgMs = 12.4, LossPercent = 0 },
        "traceroute" => new TracerouteResponse { Destination = ((DestinationRequest)body!).Destination!, Hops = [new TracerouteHop { Hop = 1 }, new TracerouteHop { Hop = 2 }] },
        "mtr" => new MtrResponse { Destination = ((DestinationRequest)body!).Destination!, Hops = [new MtrHop { Hop = 1 }] },
        _ => new DnsResponse { Name = ((DnsLookupRequest)body!).Name!, RecordType = "A", Records = [new DnsRecord("example.com", "A", 60, "93.184.216.34")] },
    };

    public Func<CancellationToken, Task>? Gate { get; set; }

    public Func<PerformanceResponse> Performance { get; set; } = () => new PerformanceResponse
    {
        Ipv4 = new FamilyPerformance { Status = ServiceStatus.Operational, AvgLatencyMs = 10, UptimePercent = 100, Samples = [new LatencySample(DateTimeOffset.UtcNow, 10)] },
        Ipv6 = new FamilyPerformance { Status = ServiceStatus.Operational, AvgLatencyMs = 12, UptimePercent = 100, Samples = [new LatencySample(DateTimeOffset.UtcNow, 12)] },
        AvgLatencyMs = 11,
    };

    public Func<EgressAddresses> Egress { get; set; } = () => new EgressAddresses("198.51.100.7", "2001:db8::7");

    public double? Ready { get; set; } = 3.2;

    public async Task<TResponse> PostAsync<TResponse>(string operation, object? body, string requestId, CancellationToken cancellationToken)
    {
        Calls.Add((operation, body, requestId));
        if (Gate is not null)
        {
            await Gate(cancellationToken);
        }

        return (TResponse)Respond(operation, body);
    }

    public Task<PerformanceResponse> GetPerformanceAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Performance());

    public Task<EgressAddresses> GetEgressAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Egress());

    public Task<double?> CheckReadyAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Ready);
}

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public FakeDiagnosticsClient Diagnostics { get; } = new();

    public Dictionary<string, string?> Settings { get; } = [];

    public ApiFactory WithSettings(params (string Key, string Value)[] settings)
    {
        foreach (var (key, value) in settings)
        {
            Settings[key] = value;
        }

        return this;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        foreach (var (key, value) in Settings)
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IDiagnosticsClient>();
            services.AddSingleton<IDiagnosticsClient>(Diagnostics);
        });
    }
}
