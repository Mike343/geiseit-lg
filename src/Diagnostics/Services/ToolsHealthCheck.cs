using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Services;

public sealed class ToolsHealthCheck(IOptions<DiagnosticsOptions> options) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        if (settings.Simulated)
        {
            return Task.FromResult(HealthCheckResult.Healthy("Simulated diagnostics"));
        }

        var missing = new[] { settings.Tools.Ping, settings.Tools.Traceroute, settings.Tools.Mtr }
            .Where(path => !File.Exists(path))
            .ToList();

        return Task.FromResult(missing.Count == 0
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy($"Missing diagnostic tools: {string.Join(", ", missing)}"));
    }
}
