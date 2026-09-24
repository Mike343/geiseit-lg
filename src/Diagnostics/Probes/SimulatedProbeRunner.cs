using System.Net;
using System.Net.Sockets;
using GeiseIT.LookingGlass.Contracts;

namespace GeiseIT.LookingGlass.Diagnostics.Probes;

public sealed class SimulatedProbeRunner : IProbeRunner
{
    public async Task<PingRaw> PingAsync(IPAddress target, CancellationToken cancellationToken)
    {
        var random = SeededRandom(target);
        var baseLatency = 8 + random.NextDouble() * 25;
        var replies = new List<PingReply>();
        for (var i = 1; i <= 5; i++)
        {
            await Task.Delay(250, cancellationToken);
            replies.Add(new PingReply(i, 58, Math.Round(baseLatency + random.NextDouble() * 3, 1)));
        }

        var times = replies.Select(r => r.TimeMs).ToList();
        var avg = times.Average();
        var stdDev = Math.Sqrt(times.Average(t => Math.Pow(t - avg, 2)));
        return new PingRaw(5, 5, 0, times.Min(), Math.Round(avg, 3), times.Max(), Math.Round(stdDev, 3), replies);
    }

    public async Task<IReadOnlyList<TraceHopRaw>> TracerouteAsync(IPAddress target, CancellationToken cancellationToken)
    {
        var random = SeededRandom(target);
        var hops = new List<TraceHopRaw>();
        var latency = 0.4;
        var hopCount = 7 + random.Next(0, 4);
        for (var hop = 1; hop <= hopCount; hop++)
        {
            await Task.Delay(120, cancellationToken);
            latency += hop < 3 ? random.NextDouble() * 0.5 : 1 + random.NextDouble() * 4;
            IPAddress? address = hop switch
            {
                1 => IPAddress.Parse("10.244.0.1"),
                2 => IPAddress.Parse("192.168.10.1"),
                _ when hop == hopCount => target,
                _ when hop == 5 && hopCount > 7 => null,
                _ => SimulatedHopAddress(target, hop, target.AddressFamily),
            };
            var rtts = address is null
                ? [null, null, null]
                : new double?[] { Round(latency), Round(latency + random.NextDouble() * 0.6), Round(latency + random.NextDouble() * 0.9) };
            hops.Add(new TraceHopRaw(hop, address, rtts));
        }

        return hops;
    }

    public async Task<MtrRaw> MtrAsync(IPAddress target, CancellationToken cancellationToken)
    {
        var trace = await TracerouteAsync(target, cancellationToken);
        var random = SeededRandom(target);
        var hops = trace.Select(h =>
        {
            if (h.Address is null)
            {
                return new MtrHopRaw(h.Hop, null, 100, 10, null, null, null, null, null);
            }

            var avg = h.RttMs.Where(r => r.HasValue).Average(r => r!.Value);
            var loss = h.Hop == 6 ? 10.0 : 0.0;
            return new MtrHopRaw(
                h.Hop,
                h.Address,
                loss,
                10,
                Round(avg + random.NextDouble()),
                Round(avg),
                Round(avg * 0.85),
                Round(avg * 1.4),
                Round(avg * 0.12));
        }).ToList();

        return new MtrRaw(10, hops);
    }

    private static double Round(double value) => Math.Round(value, 2);

    private static Random SeededRandom(IPAddress target) =>
        new(BitConverter.ToInt32(target.GetAddressBytes().AsSpan()[^4..]));

    private static IPAddress SimulatedHopAddress(IPAddress target, int hop, AddressFamily family) =>
        family == AddressFamily.InterNetworkV6
            ? IPAddress.Parse($"2a01:4f8:{hop:x}::1")
            : IPAddress.Parse($"62.115.{100 + hop}.{(target.GetAddressBytes()[3] % 200) + 1}");
}
