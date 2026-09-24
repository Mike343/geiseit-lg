using Prometheus;

namespace GeiseIT.LookingGlass.Api.Metrics;

public static class ApiMetrics
{
    public static readonly Counter Requests = Prometheus.Metrics.CreateCounter(
        "looking_glass_requests_total",
        "Diagnostic requests handled by the API.",
        "type");

    public static readonly Counter RequestsFailed = Prometheus.Metrics.CreateCounter(
        "looking_glass_requests_failed_total",
        "Diagnostic requests that did not complete successfully.",
        "type",
        "reason");

    public static readonly Histogram RequestDuration = Prometheus.Metrics.CreateHistogram(
        "looking_glass_request_duration_seconds",
        "End-to-end duration of diagnostic requests.",
        new HistogramConfiguration
        {
            LabelNames = ["type"],
            Buckets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 45, 60],
        });

    public static readonly Gauge Active = Prometheus.Metrics.CreateGauge(
        "looking_glass_diagnostics_active",
        "Diagnostic requests currently in flight through the API.");

    public static readonly Counter Rejected = Prometheus.Metrics.CreateCounter(
        "looking_glass_diagnostics_rejected_total",
        "Requests rejected before reaching the diagnostics service.",
        "reason");

    public static readonly Gauge BgpSessions = Prometheus.Metrics.CreateGauge(
        "looking_glass_bgp_sessions",
        "Established BGP sessions.");

    public static readonly Gauge BgpRoutes = Prometheus.Metrics.CreateGauge(
        "looking_glass_bgp_routes",
        "Routes in the BGP table.");

    public static void Initialize()
    {
        foreach (var type in new[] { "ping", "traceroute", "mtr", "dns" })
        {
            Requests.WithLabels(type);
            RequestDuration.WithLabels(type);
        }

        foreach (var reason in new[] { "rate_limited", "concurrency", "validation_failed", "destination_blocked", "busy" })
        {
            Rejected.WithLabels(reason);
        }

        Active.Set(0);
        BgpSessions.Set(0);
        BgpRoutes.Set(0);
    }
}
