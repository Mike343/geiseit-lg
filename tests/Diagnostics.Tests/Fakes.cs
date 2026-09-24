using System.Net;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Dns;
using GeiseIT.LookingGlass.Diagnostics.Execution;
using GeiseIT.LookingGlass.Diagnostics.Probes;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Tests;

internal sealed class FakeHostResolver : IHostResolver
{
    public Dictionary<string, IPAddress[]> Hosts { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<IPAddress, string> Reverse { get; } = [];

    public int ResolveCalls { get; private set; }

    public Task<IReadOnlyList<IPAddress>> ResolveAsync(string host, IpFamily family, CancellationToken cancellationToken)
    {
        ResolveCalls++;
        var addresses = Hosts.TryGetValue(host, out var found) ? found : [];
        var filtered = addresses.Where(a => family switch
        {
            IpFamily.Ipv4 => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork,
            IpFamily.Ipv6 => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6,
            _ => true,
        }).ToList();
        return Task.FromResult<IReadOnlyList<IPAddress>>(filtered);
    }

    public Task<string?> ReverseAsync(IPAddress address, CancellationToken cancellationToken) =>
        Task.FromResult(Reverse.TryGetValue(address, out var name) ? name : null);
}

internal sealed class FakeDnsQuery : IDnsQuery
{
    public Func<string, string, DnsQueryResult> Handler { get; set; } = (_, _) => new DnsQueryResult("NoError", []);

    public List<(string Name, string Type)> Queries { get; } = [];

    public Task<DnsQueryResult> QueryAsync(string name, string recordType, CancellationToken cancellationToken)
    {
        Queries.Add((name, recordType));
        return Task.FromResult(Handler(name, recordType));
    }
}

internal sealed class FakeProbeRunner : IProbeRunner
{
    public List<IPAddress> Targets { get; } = [];

    public PingRaw Ping { get; set; } = new(5, 5, 0, 10, 12, 14, 1, [new PingReply(1, 60, 12)]);

    public IReadOnlyList<TraceHopRaw> Trace { get; set; } = [];

    public MtrRaw Mtr { get; set; } = new(5, []);

    public Task<PingRaw> PingAsync(IPAddress target, CancellationToken cancellationToken)
    {
        Targets.Add(target);
        return Task.FromResult(Ping);
    }

    public Task<IReadOnlyList<TraceHopRaw>> TracerouteAsync(IPAddress target, CancellationToken cancellationToken)
    {
        Targets.Add(target);
        return Task.FromResult(Trace);
    }

    public Task<MtrRaw> MtrAsync(IPAddress target, CancellationToken cancellationToken)
    {
        Targets.Add(target);
        return Task.FromResult(Mtr);
    }
}

internal sealed class FakeProcessRunner : IProcessRunner
{
    public ProcessResult Result { get; set; } = new(0, string.Empty, string.Empty, false);

    public List<(string File, string[] Args)> Calls { get; } = [];

    public Task<ProcessResult> RunAsync(string fileName, IReadOnlyList<string> arguments, int maxOutputBytes, CancellationToken cancellationToken)
    {
        Calls.Add((fileName, [.. arguments]));
        return Task.FromResult(Result);
    }
}

internal static class TestOptions
{
    public static IOptions<DiagnosticsOptions> Diagnostics(Action<DiagnosticsOptions>? configure = null)
    {
        var options = new DiagnosticsOptions();
        configure?.Invoke(options);
        return Options.Create(options);
    }
}
