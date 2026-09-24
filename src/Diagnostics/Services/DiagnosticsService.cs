using System.Net;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics.Dns;
using GeiseIT.LookingGlass.Diagnostics.Execution;
using GeiseIT.LookingGlass.Diagnostics.Probes;
using GeiseIT.LookingGlass.Diagnostics.Security;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Services;

public sealed class DiagnosticsService(
    TargetResolver targets,
    IProbeRunner probes,
    IHostResolver resolver,
    DestinationPolicy policy,
    DiagnosticsExecutor executor,
    IOptions<DiagnosticsOptions> options,
    TimeProvider time)
{
    private DiagnosticsOptions Settings => options.Value;

    public Task<PingResponse> PingAsync(DestinationRequest? request, string requestId, CancellationToken cancellationToken) =>
        executor.ExecuteAsync(DiagnosticTypes.Ping, async ct =>
        {
            var started = time.GetUtcNow();
            var target = await targets.ResolveAsync(request?.Destination, request?.Family ?? IpFamily.Auto, ct);
            var raw = await probes.PingAsync(target.Address, ct);
            return new PingResponse
            {
                RequestId = requestId,
                Destination = target.Destination,
                ResolvedAddress = target.Address.ToString(),
                Family = target.Family,
                StartedAt = started,
                DurationMs = ElapsedMs(started),
                Transmitted = raw.Transmitted,
                Received = raw.Received,
                LossPercent = raw.LossPercent,
                MinMs = raw.MinMs,
                AvgMs = raw.AvgMs,
                MaxMs = raw.MaxMs,
                StdDevMs = raw.StdDevMs,
                Replies = raw.Replies,
                TechnicalOutput = TextRenderer.Ping(target, raw),
                Simulated = Settings.Simulated,
            };
        }, cancellationToken);

    public Task<TracerouteResponse> TracerouteAsync(DestinationRequest? request, string requestId, CancellationToken cancellationToken) =>
        executor.ExecuteAsync(DiagnosticTypes.Traceroute, async ct =>
        {
            var started = time.GetUtcNow();
            var target = await targets.ResolveAsync(request?.Destination, request?.Family ?? IpFamily.Auto, ct);
            var raw = await probes.TracerouteAsync(target.Address, ct);
            var names = await ReverseLookupAsync(raw.Select(h => h.Address), ct);

            var hops = raw
                .Select(h =>
                {
                    var (redacted, address, hostname) = Present(h.Address, names);
                    var responded = h.Address is not null || h.RttMs.Any(r => r.HasValue);
                    var values = h.RttMs.Where(r => r.HasValue).Select(r => r!.Value).ToList();
                    return new TracerouteHop
                    {
                        Hop = h.Hop,
                        Responded = responded,
                        Redacted = redacted,
                        Address = address,
                        Hostname = hostname,
                        RttMs = h.RttMs,
                        AvgMs = values.Count > 0 ? Math.Round(values.Average(), 3) : null,
                    };
                })
                .ToList();

            var reached = raw.Count > 0 && Equals(raw[^1].Address, target.Address);
            return new TracerouteResponse
            {
                RequestId = requestId,
                Destination = target.Destination,
                ResolvedAddress = target.Address.ToString(),
                Family = target.Family,
                StartedAt = started,
                DurationMs = ElapsedMs(started),
                ReachedDestination = reached,
                Hops = hops,
                TechnicalOutput = TextRenderer.Traceroute(target, hops, Settings.Traceroute.MaxHops),
                Simulated = Settings.Simulated,
            };
        }, cancellationToken);

    public Task<MtrResponse> MtrAsync(DestinationRequest? request, string requestId, CancellationToken cancellationToken) =>
        executor.ExecuteAsync(DiagnosticTypes.Mtr, async ct =>
        {
            var started = time.GetUtcNow();
            var target = await targets.ResolveAsync(request?.Destination, request?.Family ?? IpFamily.Auto, ct);
            var raw = await probes.MtrAsync(target.Address, ct);
            var names = await ReverseLookupAsync(raw.Hops.Select(h => h.Address), ct);

            var hops = raw.Hops
                .Select(h =>
                {
                    var (redacted, address, hostname) = Present(h.Address, names);
                    return new MtrHop
                    {
                        Hop = h.Hop,
                        Responded = h.Address is not null,
                        Redacted = redacted,
                        Address = address,
                        Hostname = hostname,
                        LossPercent = h.LossPercent,
                        Sent = h.Sent,
                        LastMs = h.LastMs,
                        AvgMs = h.AvgMs,
                        BestMs = h.BestMs,
                        WorstMs = h.WorstMs,
                        StdDevMs = h.StdDevMs,
                    };
                })
                .ToList();

            return new MtrResponse
            {
                RequestId = requestId,
                Destination = target.Destination,
                ResolvedAddress = target.Address.ToString(),
                Family = target.Family,
                StartedAt = started,
                DurationMs = ElapsedMs(started),
                Cycles = raw.Cycles,
                Hops = hops,
                TechnicalOutput = TextRenderer.Mtr(target, hops),
                Simulated = Settings.Simulated,
            };
        }, cancellationToken);

    private long ElapsedMs(DateTimeOffset started) =>
        (long)(time.GetUtcNow() - started).TotalMilliseconds;

    private (bool Redacted, string? Address, string? Hostname) Present(
        IPAddress? address,
        IReadOnlyDictionary<IPAddress, string> names)
    {
        if (address is null)
        {
            return (false, null, null);
        }

        if (Settings.RedactPrivateHops && policy.Blocklist.IsBlocked(address))
        {
            return (true, null, null);
        }

        return (false, address.ToString(), names.GetValueOrDefault(address));
    }

    private async Task<IReadOnlyDictionary<IPAddress, string>> ReverseLookupAsync(
        IEnumerable<IPAddress?> addresses,
        CancellationToken cancellationToken)
    {
        if (!Settings.ReverseDns)
        {
            return new Dictionary<IPAddress, string>();
        }

        var publicAddresses = addresses
            .OfType<IPAddress>()
            .Distinct()
            .Where(a => !policy.Blocklist.IsBlocked(a))
            .ToList();

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(4));

        var lookups = await Task.WhenAll(publicAddresses.Select(async a =>
        {
            try
            {
                return (Address: a, Name: await resolver.ReverseAsync(a, budget.Token));
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return (Address: a, Name: null);
            }
        }));

        return lookups
            .Where(l => !string.IsNullOrWhiteSpace(l.Name))
            .ToDictionary(l => l.Address, l => l.Name!);
    }
}
