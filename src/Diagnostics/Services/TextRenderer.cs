using System.Globalization;
using System.Text;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Probes;
using GeiseIT.LookingGlass.Diagnostics.Security;

namespace GeiseIT.LookingGlass.Diagnostics.Services;

public static class TextRenderer
{
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    public static string Ping(ResolvedTarget target, PingRaw raw)
    {
        var builder = new StringBuilder();
        builder.AppendLine(Invariant, $"PING {Label(target)}");
        foreach (var reply in raw.Replies)
        {
            var ttl = reply.Ttl is { } t ? $" ttl={t}" : string.Empty;
            builder.AppendLine(Invariant, $"reply from {target.Address}: icmp_seq={reply.Seq}{ttl} time={reply.TimeMs:0.0#} ms");
        }

        builder.AppendLine();
        builder.AppendLine(Invariant, $"--- {target.Destination} ping statistics ---");
        builder.AppendLine(Invariant, $"{raw.Transmitted} packets transmitted, {raw.Received} received, {raw.LossPercent:0.#}% packet loss");
        if (raw.MinMs is { } min && raw.AvgMs is { } avg && raw.MaxMs is { } max)
        {
            var dev = raw.StdDevMs is { } d ? $"/{d:0.###}" : string.Empty;
            builder.AppendLine(Invariant, $"rtt min/avg/max/stddev = {min:0.###}/{avg:0.###}/{max:0.###}{dev} ms");
        }

        return Normalise(builder);
    }

    public static string Traceroute(ResolvedTarget target, IReadOnlyList<TracerouteHop> hops, int maxHops)
    {
        var builder = new StringBuilder();
        builder.AppendLine(Invariant, $"traceroute to {Label(target)}, {maxHops} hops max");
        foreach (var hop in hops)
        {
            var rtts = string.Join("  ", hop.RttMs.Select(r => r is { } v ? $"{v:0.##} ms" : "*"));
            var host = hop switch
            {
                { Responded: false } => "* * *",
                { Redacted: true } => "[internal network]",
                { Hostname: { } name, Address: { } addr } => $"{name} ({addr})",
                { Address: { } addr } => addr,
                _ => "*",
            };

            builder.AppendLine(hop.Responded
                ? string.Create(Invariant, $"{hop.Hop,2}  {host}  {rtts}")
                : string.Create(Invariant, $"{hop.Hop,2}  {host}"));
        }

        return Normalise(builder);
    }

    public static string Mtr(ResolvedTarget target, IReadOnlyList<MtrHop> hops)
    {
        var rows = hops.Select(h => new[]
        {
            $"{h.Hop}.",
            h.Redacted ? "[internal network]" : h.Hostname is { } n && h.Address is { } a ? $"{n} ({a})" : h.Address ?? "???",
            $"{h.LossPercent:0.0}%",
            h.Sent.ToString(Invariant),
            Format(h.LastMs),
            Format(h.AvgMs),
            Format(h.BestMs),
            Format(h.WorstMs),
            Format(h.StdDevMs),
        }).ToList();

        string[] header = ["Hop", "Host", "Loss%", "Snt", "Last", "Avg", "Best", "Wrst", "StDev"];
        var widths = header.Select((h, i) => Math.Max(h.Length, rows.Select(r => r[i].Length).DefaultIfEmpty(0).Max())).ToArray();

        var builder = new StringBuilder();
        builder.AppendLine(Invariant, $"mtr report to {Label(target)}");
        builder.AppendLine(Line(header, widths));
        foreach (var row in rows)
        {
            builder.AppendLine(Line(row, widths));
        }

        return Normalise(builder);
    }

    public static string Normalise(StringBuilder builder) =>
        builder.ToString().ReplaceLineEndings("\n").TrimEnd();

    private static string Line(string[] cells, int[] widths) =>
        string.Join("  ", cells.Select((c, i) => i == 1 ? c.PadRight(widths[i]) : c.PadLeft(widths[i])));

    private static string Format(double? value) => value is { } v ? v.ToString("0.0#", Invariant) : "-";

    private static string Label(ResolvedTarget target) =>
        string.Equals(target.Destination, target.Address.ToString(), StringComparison.OrdinalIgnoreCase)
            ? target.Address.ToString()
            : $"{target.Destination} ({target.Address})";
}
