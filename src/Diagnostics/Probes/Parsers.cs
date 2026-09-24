using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using GeiseIT.LookingGlass.Contracts;

namespace GeiseIT.LookingGlass.Diagnostics.Probes;

public sealed record PingRaw(
    int Transmitted,
    int Received,
    double LossPercent,
    double? MinMs,
    double? AvgMs,
    double? MaxMs,
    double? StdDevMs,
    IReadOnlyList<PingReply> Replies);

public sealed record TraceHopRaw(int Hop, IPAddress? Address, IReadOnlyList<double?> RttMs);

public sealed record MtrHopRaw(
    int Hop,
    IPAddress? Address,
    double LossPercent,
    int Sent,
    double? LastMs,
    double? AvgMs,
    double? BestMs,
    double? WorstMs,
    double? StdDevMs);

public sealed record MtrRaw(int Cycles, IReadOnlyList<MtrHopRaw> Hops);

public static partial class PingParser
{
    [GeneratedRegex(@"icmp_seq=(\d+)(?:\s+ttl=(\d+))?\s+time[=<]([\d.]+)\s*ms", RegexOptions.CultureInvariant)]
    private static partial Regex ReplyPattern();

    [GeneratedRegex(@"(\d+)\s+packets transmitted,\s+(\d+)\s+(?:packets\s+)?received.*?([\d.]+)%\s+packet loss", RegexOptions.CultureInvariant)]
    private static partial Regex SummaryPattern();

    [GeneratedRegex(@"=\s*([\d.]+)/([\d.]+)/([\d.]+)(?:/([\d.]+))?\s*ms", RegexOptions.CultureInvariant)]
    private static partial Regex RttPattern();

    public static PingRaw? Parse(string output)
    {
        var summary = SummaryPattern().Match(output);
        if (!summary.Success)
        {
            return null;
        }

        var replies = ReplyPattern().Matches(output)
            .Select(m => new PingReply(
                int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture),
                m.Groups[2].Success ? int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) : null,
                Number(m.Groups[3].Value)))
            .ToList();

        double? min = null, avg = null, max = null, dev = null;
        var rtt = RttPattern().Match(output);
        if (rtt.Success)
        {
            min = Number(rtt.Groups[1].Value);
            avg = Number(rtt.Groups[2].Value);
            max = Number(rtt.Groups[3].Value);
            dev = rtt.Groups[4].Success ? Number(rtt.Groups[4].Value) : null;
        }

        return new PingRaw(
            int.Parse(summary.Groups[1].Value, CultureInfo.InvariantCulture),
            int.Parse(summary.Groups[2].Value, CultureInfo.InvariantCulture),
            Number(summary.Groups[3].Value),
            min,
            avg,
            max,
            dev,
            replies);
    }

    private static double Number(string value) => double.Parse(value, CultureInfo.InvariantCulture);
}

public static partial class TracerouteParser
{
    [GeneratedRegex(@"^\s*(\d+)\s+(.*)$", RegexOptions.CultureInvariant)]
    private static partial Regex HopPattern();

    public static IReadOnlyList<TraceHopRaw> Parse(string output)
    {
        var hops = new List<TraceHopRaw>();
        foreach (var line in output.Split('\n'))
        {
            var match = HopPattern().Match(line.TrimEnd('\r'));
            if (!match.Success)
            {
                continue;
            }

            var hop = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            var tokens = match.Groups[2].Value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            IPAddress? address = null;
            var rtts = new List<double?>();

            for (var i = 0; i < tokens.Length; i++)
            {
                var token = tokens[i];
                if (token == "*")
                {
                    rtts.Add(null);
                }
                else if (token.StartsWith('!'))
                {
                    continue;
                }
                else if (double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out var rtt) &&
                         i + 1 < tokens.Length && tokens[i + 1] == "ms")
                {
                    rtts.Add(rtt);
                    i++;
                }
                else if ((token.Contains('.') || token.Contains(':')) && IPAddress.TryParse(token, out var parsed))
                {
                    address ??= parsed;
                }
            }

            if (rtts.Count > 0 || address is not null)
            {
                hops.Add(new TraceHopRaw(hop, address, rtts));
            }
        }

        return hops;
    }
}

public static class MtrParser
{
    public static MtrRaw Parse(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var report = document.RootElement.GetProperty("report");
            var cycles = report.TryGetProperty("mtr", out var meta) && meta.TryGetProperty("tests", out var tests)
                ? (int)ReadNumber(tests)!.Value
                : 0;

            var hops = new List<MtrHopRaw>();
            foreach (var hub in report.GetProperty("hubs").EnumerateArray())
            {
                var host = hub.GetProperty("host").GetString();
                var address = host is not null && IPAddress.TryParse(host, out var ip) ? ip : null;
                var sent = (int)(ReadNumber(hub.GetProperty("Snt")) ?? 0);
                var responded = address is not null;
                hops.Add(new MtrHopRaw(
                    (int)(ReadNumber(hub.GetProperty("count")) ?? hops.Count + 1),
                    address,
                    ReadNumber(hub.GetProperty("Loss%")) ?? 100,
                    sent,
                    responded ? ReadNumber(hub.GetProperty("Last")) : null,
                    responded ? ReadNumber(hub.GetProperty("Avg")) : null,
                    responded ? ReadNumber(hub.GetProperty("Best")) : null,
                    responded ? ReadNumber(hub.GetProperty("Wrst")) : null,
                    responded ? ReadNumber(hub.GetProperty("StDev")) : null));
            }

            return new MtrRaw(cycles > 0 ? cycles : hops.Select(h => h.Sent).DefaultIfEmpty(0).Max(), hops);
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            throw LookingGlassException.Failed("The diagnostic returned output that could not be understood.", ex);
        }
    }

    private static double? ReadNumber(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Number => element.GetDouble(),
        JsonValueKind.String when double.TryParse(element.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) => v,
        _ => null,
    };
}
