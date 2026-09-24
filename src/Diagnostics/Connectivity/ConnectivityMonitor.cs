using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using GeiseIT.LookingGlass.Diagnostics.Metrics;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Connectivity;

public interface IConnectivityProbe
{
    Task<double?> ProbeAsync(IPEndPoint target, TimeSpan timeout, CancellationToken cancellationToken);
}

public sealed class TcpConnectivityProbe : IConnectivityProbe
{
    public async Task<double?> ProbeAsync(IPEndPoint target, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var socket = new Socket(target.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        linked.CancelAfter(timeout);
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await socket.ConnectAsync(target, linked.Token);
            return stopwatch.Elapsed.TotalMilliseconds;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
        catch (SocketException)
        {
            return null;
        }
    }
}

public sealed class ConnectivityMonitor : BackgroundService
{
    private readonly ConnectivityOptions _options;
    private readonly IConnectivityProbe _probe;
    private readonly TimeProvider _time;
    private readonly ILogger<ConnectivityMonitor> _logger;
    private readonly IPEndPoint[] _ipv4Targets;
    private readonly IPEndPoint[] _ipv6Targets;
    private readonly Dictionary<IpVersion, List<LatencySample>> _samples = new()
    {
        [IpVersion.Ipv4] = [],
        [IpVersion.Ipv6] = [],
    };
    private readonly Lock _gate = new();

    public ConnectivityMonitor(
        IOptions<ConnectivityOptions> options,
        IConnectivityProbe probe,
        TimeProvider time,
        ILogger<ConnectivityMonitor> logger)
    {
        _options = options.Value;
        _probe = probe;
        _time = time;
        _logger = logger;
        _ipv4Targets = ParseTargets(_options.Ipv4Targets, AddressFamily.InterNetwork);
        _ipv6Targets = ParseTargets(_options.Ipv6Targets, AddressFamily.InterNetworkV6);
    }

    public async Task SampleOnceAsync(CancellationToken cancellationToken)
    {
        var v4 = ProbeFamilyAsync(_ipv4Targets, cancellationToken);
        var v6 = ProbeFamilyAsync(_ipv6Targets, cancellationToken);
        await Task.WhenAll(v4, v6);

        var now = _time.GetUtcNow();
        lock (_gate)
        {
            Record(IpVersion.Ipv4, _ipv4Targets.Length > 0 ? new LatencySample(now, v4.Result) : null, now);
            Record(IpVersion.Ipv6, _ipv6Targets.Length > 0 ? new LatencySample(now, v6.Result) : null, now);
        }

        PublishMetrics(IpVersion.Ipv4, "ipv4");
        PublishMetrics(IpVersion.Ipv6, "ipv6");
    }

    public PerformanceResponse Snapshot()
    {
        var now = _time.GetUtcNow();
        FamilyPerformance ipv4;
        FamilyPerformance ipv6;
        lock (_gate)
        {
            ipv4 = Summarise(IpVersion.Ipv4, _ipv4Targets.Length > 0);
            ipv6 = Summarise(IpVersion.Ipv6, _ipv6Targets.Length > 0);
        }

        var latencies = new[] { ipv4.AvgLatencyMs, ipv6.AvgLatencyMs }.Where(v => v.HasValue).Select(v => v!.Value).ToList();
        var uptimes = new[] { ipv4.UptimePercent, ipv6.UptimePercent }.Where(v => v.HasValue).Select(v => v!.Value).ToList();
        var oldest = new[] { ipv4.Samples.FirstOrDefault()?.At, ipv6.Samples.FirstOrDefault()?.At }
            .Where(v => v.HasValue)
            .Select(v => v!.Value)
            .DefaultIfEmpty(now)
            .Min();

        return new PerformanceResponse
        {
            GeneratedAt = now,
            WindowSeconds = (int)Math.Min((now - oldest).TotalSeconds, _options.WindowSeconds),
            IntervalSeconds = _options.IntervalSeconds,
            AvgLatencyMs = latencies.Count > 0 ? Math.Round(latencies.Average(), 2) : null,
            UptimePercent = uptimes.Count > 0 ? Math.Round(uptimes.Max(), 2) : null,
            Ipv4 = ipv4,
            Ipv6 = ipv6,
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_options.IntervalSeconds), _time);
        try
        {
            do
            {
                try
                {
                    await SampleOnceAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(ex, "Connectivity sampling failed");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task<double?> ProbeFamilyAsync(IPEndPoint[] targets, CancellationToken cancellationToken)
    {
        foreach (var target in targets)
        {
            var latency = await _probe.ProbeAsync(target, TimeSpan.FromSeconds(_options.ProbeTimeoutSeconds), cancellationToken);
            if (latency is not null)
            {
                return latency;
            }
        }

        return null;
    }

    private void Record(IpVersion family, LatencySample? sample, DateTimeOffset now)
    {
        if (sample is null)
        {
            return;
        }

        var list = _samples[family];
        list.Add(sample);
        var cutoff = now.AddSeconds(-_options.WindowSeconds);
        list.RemoveAll(s => s.At < cutoff);
    }

    private FamilyPerformance Summarise(IpVersion family, bool configured)
    {
        if (!configured)
        {
            return new FamilyPerformance { Status = ServiceStatus.NotConfigured };
        }

        var samples = _samples[family].ToList();
        if (samples.Count == 0)
        {
            return new FamilyPerformance { Status = ServiceStatus.Degraded };
        }

        var successes = samples.Where(s => s.LatencyMs.HasValue).ToList();
        var recent = samples.TakeLast(5).ToList();
        var status = samples[^1].LatencyMs.HasValue
            ? ServiceStatus.Operational
            : recent.Count(s => s.LatencyMs.HasValue) * 2 >= recent.Count ? ServiceStatus.Degraded : ServiceStatus.Outage;

        return new FamilyPerformance
        {
            Status = status,
            AvgLatencyMs = successes.Count > 0 ? Math.Round(successes.Average(s => s.LatencyMs!.Value), 2) : null,
            UptimePercent = Math.Round(100.0 * successes.Count / samples.Count, 2),
            Samples = Downsample(samples),
        };
    }

    private static List<LatencySample> Downsample(List<LatencySample> samples)
    {
        const int maxPoints = 288;
        if (samples.Count <= maxPoints)
        {
            return samples;
        }

        var size = (int)Math.Ceiling(samples.Count / (double)maxPoints);
        return [.. samples.Chunk(size).Select(chunk =>
        {
            var ok = chunk.Where(s => s.LatencyMs.HasValue).ToList();
            return new LatencySample(chunk[0].At, ok.Count > 0 ? Math.Round(ok.Average(s => s.LatencyMs!.Value), 2) : null);
        })];
    }

    private void PublishMetrics(IpVersion family, string label)
    {
        FamilyPerformance summary;
        lock (_gate)
        {
            summary = Summarise(family, family == IpVersion.Ipv4 ? _ipv4Targets.Length > 0 : _ipv6Targets.Length > 0);
        }

        if (summary.Status == ServiceStatus.NotConfigured || summary.Samples.Count == 0)
        {
            return;
        }

        DiagnosticsMetrics.ConnectivityUp.WithLabels(label).Set(summary.Samples[^1].LatencyMs.HasValue ? 1 : 0);
        DiagnosticsMetrics.PacketLoss.WithLabels(label).Set(100 - (summary.UptimePercent ?? 0));
        if (summary.AvgLatencyMs is { } avg)
        {
            DiagnosticsMetrics.Latency.WithLabels(label).Set(avg / 1000.0);
        }
    }

    private IPEndPoint[] ParseTargets(string csv, AddressFamily family)
    {
        var targets = new List<IPEndPoint>();
        foreach (var entry in LookingGlassConfiguration.SplitList(csv))
        {
            if (IPEndPoint.TryParse(entry, out var endpoint) && endpoint.AddressFamily == family && endpoint.Port > 0)
            {
                targets.Add(endpoint);
            }
            else
            {
                _logger.LogWarning("Ignoring invalid connectivity target {Target} for {Family}", entry, family);
            }
        }

        return [.. targets];
    }
}
