using System.Globalization;
using System.Text.Json;
using GeiseIT.LookingGlass.Contracts;

namespace GeiseIT.LookingGlass.Api.Services;

public sealed record PromSeries(IReadOnlyDictionary<string, string> Labels, IReadOnlyList<TrafficPoint> Points);

public interface IPrometheusClient
{
    bool IsConfigured { get; }

    Task<IReadOnlyList<PromSeries>> QueryRangeAsync(
        string query,
        DateTimeOffset start,
        DateTimeOffset end,
        int stepSeconds,
        CancellationToken cancellationToken);
}

public sealed class PrometheusClient(HttpClient http, Microsoft.Extensions.Options.IOptions<PrometheusOptions> options) : IPrometheusClient
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Value.BaseUrl);

    public async Task<IReadOnlyList<PromSeries>> QueryRangeAsync(
        string query,
        DateTimeOffset start,
        DateTimeOffset end,
        int stepSeconds,
        CancellationToken cancellationToken)
    {
        var uri = string.Create(
            CultureInfo.InvariantCulture,
            $"api/v1/query_range?query={Uri.EscapeDataString(query)}&start={start.ToUnixTimeSeconds()}&end={end.ToUnixTimeSeconds()}&step={stepSeconds}");

        try
        {
            using var response = await http.GetAsync(uri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw LookingGlassException.Unavailable("Traffic data is currently unavailable.");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            return Parse(document.RootElement);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or KeyNotFoundException
            && !cancellationToken.IsCancellationRequested)
        {
            throw LookingGlassException.Unavailable("Traffic data is currently unavailable.", ex);
        }
    }

    internal static IReadOnlyList<PromSeries> Parse(JsonElement root)
    {
        if (root.GetProperty("status").GetString() != "success")
        {
            throw new InvalidOperationException("Prometheus query did not succeed.");
        }

        var series = new List<PromSeries>();
        foreach (var result in root.GetProperty("data").GetProperty("result").EnumerateArray())
        {
            var labels = result.GetProperty("metric").EnumerateObject()
                .ToDictionary(p => p.Name, p => p.Value.GetString() ?? string.Empty);
            var points = new List<TrafficPoint>();
            foreach (var pair in result.GetProperty("values").EnumerateArray())
            {
                var at = DateTimeOffset.FromUnixTimeMilliseconds((long)(pair[0].GetDouble() * 1000));
                var parsed = double.TryParse(pair[1].GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
                    && double.IsFinite(value);
                points.Add(new TrafficPoint(at, parsed ? value : null));
            }

            series.Add(new PromSeries(labels, points));
        }

        return series;
    }
}
