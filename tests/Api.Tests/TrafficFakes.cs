using GeiseIT.LookingGlass.Api.Services;
using GeiseIT.LookingGlass.Contracts;

namespace GeiseIT.LookingGlass.Api.Tests;

public sealed class FakePrometheusClient : IPrometheusClient
{
    public bool IsConfigured { get; set; } = true;

    public List<(string Query, int Step, TimeSpan Window)> Queries { get; } = [];

    public Func<string, IReadOnlyList<PromSeries>?> Respond { get; set; } = DefaultResponse;

    public Task<IReadOnlyList<PromSeries>> QueryRangeAsync(string query, DateTimeOffset start, DateTimeOffset end, int stepSeconds, CancellationToken cancellationToken)
    {
        Queries.Add((query, stepSeconds, end - start));
        var result = Respond(query) ?? throw LookingGlassException.Unavailable("down");
        return Task.FromResult(result);
    }

    public static PromSeries Series(string? instance, params double?[] values)
    {
        var start = DateTimeOffset.UtcNow.AddMinutes(-values.Length);
        var labels = instance is null ? new Dictionary<string, string>() : new Dictionary<string, string> { ["instance"] = instance };
        return new PromSeries(labels, [.. values.Select((v, i) => new TrafficPoint(start.AddMinutes(i), v))]);
    }

    public static IReadOnlyList<PromSeries>? DefaultResponse(string query)
    {
        if (query.Contains("nginx_ingress_controller_request_size_sum"))
        {
            return [Series(null, 100_000, 120_000)];
        }

        if (query.Contains("nginx_ingress_controller_response_size_sum"))
        {
            return [Series(null, 1_500_000, 1_600_000)];
        }

        if (query.Contains("job=\"opnsense\""))
        {
            return [];
        }

        if (query.Contains("node_network_speed_bytes"))
        {
            return
            [
                Series("10.0.0.3:9100", 10_000_000_000),
                Series("10.0.0.1:9100", 10_000_000_000),
                Series("10.0.0.2:9100", -8),
            ];
        }

        if (query.StartsWith("sum by (instance)", StringComparison.Ordinal))
        {
            var scale = query.Contains("receive") ? 1.0 : 2.0;
            return
            [
                Series("10.0.0.3:9100", 3_000_000 * scale, null, 4_000_000 * scale),
                Series("10.0.0.1:9100", 1_000_000 * scale, 2_000_000 * scale, null),
                Series("10.0.0.2:9100", 500_000 * scale, 500_000 * scale, 600_000 * scale),
            ];
        }

        if (query.StartsWith("sum(rate(node_network_receive", StringComparison.Ordinal))
        {
            return [Series(null, 4_500_000, 6_500_000, 7_000_000)];
        }

        return [Series(null, 9_000_000, 13_000_000, 14_000_000)];
    }
}
