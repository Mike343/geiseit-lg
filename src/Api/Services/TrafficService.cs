using System.Globalization;
using System.Net;
using GeiseIT.LookingGlass.Contracts;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.Services;

public sealed class TrafficService(
    IPrometheusClient prometheus,
    IOptions<TrafficOptions> options,
    TimeProvider time)
{
    private static readonly Dictionary<string, (TimeSpan Window, int StepSeconds)> Ranges = new(StringComparer.Ordinal)
    {
        ["1h"] = (TimeSpan.FromHours(1), 30),
        ["6h"] = (TimeSpan.FromHours(6), 120),
        ["24h"] = (TimeSpan.FromHours(24), 300),
    };

    private readonly Dictionary<string, TtlCache<TrafficResponse>> _caches =
        Ranges.Keys.ToDictionary(k => k, _ => new TtlCache<TrafficResponse>(TimeSpan.FromSeconds(15), time), StringComparer.Ordinal);

    public static bool IsValidRange(string? range) => range is not null && Ranges.ContainsKey(range);

    public Task<TrafficResponse> GetAsync(string range, CancellationToken cancellationToken)
    {
        if (!prometheus.IsConfigured)
        {
            throw LookingGlassException.Unavailable("Traffic data is not configured on this Looking Glass.");
        }

        return _caches[range].GetAsync(ct => BuildAsync(range, ct), cancellationToken);
    }

    private async Task<TrafficResponse> BuildAsync(string range, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var (window, step) = Ranges[range];
        var end = time.GetUtcNow();
        var start = end - window;
        var rate = $"{Math.Max(60, step * 2)}s";
        var device = $"device=~\"{settings.NodeDeviceRegex}\"";
        var job = $"job=\"{settings.NodeJob}\"";

        Task<IReadOnlyList<PromSeries>> Query(string q) => prometheus.QueryRangeAsync(q, start, end, step, cancellationToken);

        var nodeRx = Query($"sum by (instance) (rate(node_network_receive_bytes_total{{{job},{device}}}[{rate}])) * 8");
        var nodeTx = Query($"sum by (instance) (rate(node_network_transmit_bytes_total{{{job},{device}}}[{rate}])) * 8");
        var capacity = Query($"max by (instance) (node_network_speed_bytes{{{job},{device}}}) * 8");
        var clusterRx = Query($"sum(rate(node_network_receive_bytes_total{{{job},{device}}}[{rate}])) * 8");
        var clusterTx = Query($"sum(rate(node_network_transmit_bytes_total{{{job},{device}}}[{rate}])) * 8");
        var webIn = OptionalAsync(() => Query($"sum(rate(nginx_ingress_controller_request_size_sum[{rate}])) * 8"));
        var webOut = OptionalAsync(() => Query($"sum(rate(nginx_ingress_controller_response_size_sum[{rate}])) * 8"));
        var wanRx = string.IsNullOrEmpty(settings.WanDevice)
            ? Task.FromResult<IReadOnlyList<PromSeries>>([])
            : OptionalAsync(() => Query($"sum(rate(node_network_receive_bytes_total{{job=\"{settings.WanJob}\",device=\"{settings.WanDevice}\"}}[{rate}])) * 8"));
        var wanTx = string.IsNullOrEmpty(settings.WanDevice)
            ? Task.FromResult<IReadOnlyList<PromSeries>>([])
            : OptionalAsync(() => Query($"sum(rate(node_network_transmit_bytes_total{{job=\"{settings.WanJob}\",device=\"{settings.WanDevice}\"}}[{rate}])) * 8"));

        await Task.WhenAll(nodeRx, nodeTx, capacity, clusterRx, clusterTx, webIn, webOut, wanRx, wanTx);

        var nodes = BuildNodes(nodeRx.Result, nodeTx.Result, capacity.Result);
        var cluster = new DirectionalTraffic { Rx = First(clusterRx.Result), Tx = First(clusterTx.Result) };
        var internet = new InternetTraffic
        {
            Available = wanRx.Result.Count > 0 && wanTx.Result.Count > 0,
            Rx = First(wanRx.Result),
            Tx = First(wanTx.Result),
        };
        var web = new WebTraffic
        {
            Available = webIn.Result.Count > 0 && webOut.Result.Count > 0,
            In = First(webIn.Result),
            Out = First(webOut.Result),
        };

        return new TrafficResponse
        {
            GeneratedAt = end,
            Range = range,
            StepSeconds = step,
            Current = new TrafficCurrent
            {
                ClusterRxBps = Latest(cluster.Rx),
                ClusterTxBps = Latest(cluster.Tx),
                InternetRxBps = internet.Available ? Latest(internet.Rx) : null,
                InternetTxBps = internet.Available ? Latest(internet.Tx) : null,
                WebInBps = web.Available ? Latest(web.In) : null,
                WebOutBps = web.Available ? Latest(web.Out) : null,
            },
            Cluster = cluster,
            Nodes = nodes,
            Internet = internet,
            Web = web,
        };
    }

    private static async Task<IReadOnlyList<PromSeries>> OptionalAsync(Func<Task<IReadOnlyList<PromSeries>>> query)
    {
        try
        {
            return await query();
        }
        catch (LookingGlassException)
        {
            return [];
        }
    }

    private static IReadOnlyList<NodeTraffic> BuildNodes(
        IReadOnlyList<PromSeries> rx,
        IReadOnlyList<PromSeries> tx,
        IReadOnlyList<PromSeries> capacity)
    {
        var txByInstance = tx.Where(s => s.Labels.ContainsKey("instance")).ToDictionary(s => s.Labels["instance"]);
        var capacityByInstance = capacity.Where(s => s.Labels.ContainsKey("instance")).ToDictionary(s => s.Labels["instance"]);

        return
        [
            .. rx
                .Where(s => s.Labels.TryGetValue("instance", out var i) && txByInstance.ContainsKey(i))
                .OrderBy(s => SortKey(s.Labels["instance"]), StringComparer.Ordinal)
                .Select((s, index) =>
                {
                    var instance = s.Labels["instance"];
                    var speed = capacityByInstance.TryGetValue(instance, out var c) ? Latest(c.Points) : null;
                    return new NodeTraffic
                    {
                        Label = string.Create(CultureInfo.InvariantCulture, $"Node {index + 1}"),
                        CapacityBitsPerSecond = speed is > 0 ? speed : null,
                        Rx = s.Points,
                        Tx = txByInstance[instance].Points,
                    };
                }),
        ];
    }

    private static string SortKey(string instance)
    {
        var host = instance.Contains(':') && instance.Count(c => c == ':') == 1 ? instance[..instance.IndexOf(':')] : instance;
        return IPAddress.TryParse(host, out var ip)
            ? Convert.ToHexString(ip.GetAddressBytes())
            : instance;
    }

    private static IReadOnlyList<TrafficPoint> First(IReadOnlyList<PromSeries> series) =>
        series.Count > 0 ? series[0].Points : [];

    private static double? Latest(IReadOnlyList<TrafficPoint> points) =>
        points.LastOrDefault(p => p.BitsPerSecond.HasValue)?.BitsPerSecond;
}
