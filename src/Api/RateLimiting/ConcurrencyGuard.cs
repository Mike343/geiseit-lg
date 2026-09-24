using System.Collections.Concurrent;
using GeiseIT.LookingGlass.Api.Metrics;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.RateLimiting;

public sealed class ConcurrencyTracker
{
    private readonly ConcurrentDictionary<string, int> _inFlight = new();

    public int Enter(string key) => _inFlight.AddOrUpdate(key, 1, (_, count) => count + 1);

    public void Leave(string key)
    {
        var remaining = _inFlight.AddOrUpdate(key, 0, (_, count) => count - 1);
        if (remaining <= 0)
        {
            _inFlight.TryRemove(new KeyValuePair<string, int>(key, remaining));
        }
    }
}

public sealed class ConcurrencyGuard(RequestDelegate next, ConcurrencyTracker tracker, IOptions<RateLimitingOptions> options)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api/v1/diagnostics"))
        {
            await next(context);
            return;
        }

        var key = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var current = tracker.Enter(key);
        try
        {
            if (current > options.Value.MaxConcurrentPerIp)
            {
                ApiMetrics.Rejected.WithLabels("concurrency").Inc();
                await ProblemResults.WriteAsync(
                    context,
                    StatusCodes.Status429TooManyRequests,
                    ProblemCodes.RateLimited,
                    ProblemExceptionHandler.Title(ProblemCodes.RateLimited),
                    "You already have the maximum number of diagnostics running. Wait for one to finish and try again.",
                    retryAfterSeconds: 2);
                return;
            }

            await next(context);
        }
        finally
        {
            tracker.Leave(key);
        }
    }
}
