using Prometheus;

namespace GeiseIT.LookingGlass.Diagnostics.Metrics;

public static class DiagnosticsMetrics
{
    public static readonly Counter Requests = Prometheus.Metrics.CreateCounter(
        "looking_glass_requests_total",
        "Diagnostic requests handled by the diagnostics service.",
        "type");

    public static readonly Counter RequestsFailed = Prometheus.Metrics.CreateCounter(
        "looking_glass_requests_failed_total",
        "Diagnostic requests that did not complete successfully.",
        "type",
        "reason");

    public static readonly Histogram RequestDuration = Prometheus.Metrics.CreateHistogram(
        "looking_glass_request_duration_seconds",
        "Time taken to complete a diagnostic.",
        new HistogramConfiguration
        {
            LabelNames = ["type"],
            Buckets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 45, 60],
        });

    public static readonly Gauge Active = Prometheus.Metrics.CreateGauge(
        "looking_glass_diagnostics_active",
        "Diagnostics currently executing.");

    public static readonly Counter Rejected = Prometheus.Metrics.CreateCounter(
        "looking_glass_diagnostics_rejected_total",
        "Diagnostics rejected before execution.",
        "reason");

    public static readonly Gauge PacketLoss = Prometheus.Metrics.CreateGauge(
        "looking_glass_packet_loss",
        "Packet loss percentage of the connectivity probes over the retention window.",
        "family");

    public static readonly Gauge Latency = Prometheus.Metrics.CreateGauge(
        "looking_glass_latency_seconds",
        "Average connectivity probe latency over the retention window.",
        "family");

    public static readonly Gauge ConnectivityUp = Prometheus.Metrics.CreateGauge(
        "looking_glass_connectivity_up",
        "Whether the most recent connectivity probe succeeded (1) or failed (0).",
        "family");

    public static void Initialize()
    {
        foreach (var type in new[] { "ping", "traceroute", "mtr", "dns" })
        {
            Requests.WithLabels(type);
            RequestDuration.WithLabels(type);
        }

        foreach (var reason in new[] { "queue_full", "queue_timeout", "validation_failed", "destination_blocked" })
        {
            Rejected.WithLabels(reason);
        }

        Active.Set(0);
    }
}
