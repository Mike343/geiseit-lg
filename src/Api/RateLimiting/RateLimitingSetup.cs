using System.Globalization;
using System.Threading.RateLimiting;
using GeiseIT.LookingGlass.Api.Metrics;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.RateLimiting;

public static class RateLimitPolicies
{
    public const string Ping = "ping";
    public const string Traceroute = "traceroute";
    public const string Mtr = "mtr";
    public const string Dns = "dns";
    public const string Info = "info";
}

public static class RateLimitingSetup
{
    public static IServiceCollection AddLookingGlassRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = WriteRejectionAsync;
        });

        services.AddOptions<RateLimiterOptions>().Configure<IOptions<RateLimitingOptions>>((limiter, options) =>
        {
            var settings = options.Value;
            limiter.AddPolicy(RateLimitPolicies.Ping, Window(settings.Ping));
            limiter.AddPolicy(RateLimitPolicies.Traceroute, Window(settings.Traceroute));
            limiter.AddPolicy(RateLimitPolicies.Mtr, Window(settings.Mtr));
            limiter.AddPolicy(RateLimitPolicies.Dns, Window(settings.Dns));
            limiter.AddPolicy(RateLimitPolicies.Info, Window(settings.Info));
        });

        return services;
    }

    private static Func<HttpContext, RateLimitPartition<string>> Window(EndpointLimit limit) =>
        context => RateLimitPartition.GetSlidingWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = limit.PermitLimit,
                Window = TimeSpan.FromSeconds(limit.WindowSeconds),
                SegmentsPerWindow = 6,
                QueueLimit = 0,
                AutoReplenishment = true,
            });

    private static async ValueTask WriteRejectionAsync(OnRejectedContext rejected, CancellationToken cancellationToken)
    {
        var context = rejected.HttpContext;
        var settings = context.RequestServices.GetRequiredService<IOptions<RateLimitingOptions>>().Value;
        var (label, limit) = Describe(context.Request.Path, settings);

        var retryAfter = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry)
            ? (int)Math.Ceiling(retry.TotalSeconds)
            : limit.WindowSeconds;

        var window = limit.WindowSeconds == 60
            ? "minute"
            : string.Create(CultureInfo.InvariantCulture, $"{limit.WindowSeconds} seconds");
        var detail = string.Create(
            CultureInfo.InvariantCulture,
            $"You have reached the limit of {limit.PermitLimit} {label} requests per {window}. Try again in {retryAfter} seconds.");
        ApiMetrics.Rejected.WithLabels("rate_limited").Inc();

        await ProblemResults.WriteAsync(
            context,
            StatusCodes.Status429TooManyRequests,
            ProblemCodes.RateLimited,
            ProblemExceptionHandler.Title(ProblemCodes.RateLimited),
            detail,
            retryAfter);
    }

    private static (string Label, EndpointLimit Limit) Describe(PathString path, RateLimitingOptions settings)
    {
        var value = path.Value ?? string.Empty;
        if (value.EndsWith("/ping", StringComparison.OrdinalIgnoreCase))
        {
            return ("ping", settings.Ping);
        }

        if (value.EndsWith("/traceroute", StringComparison.OrdinalIgnoreCase))
        {
            return ("traceroute", settings.Traceroute);
        }

        if (value.EndsWith("/mtr", StringComparison.OrdinalIgnoreCase))
        {
            return ("MTR", settings.Mtr);
        }

        if (value.EndsWith("/dns", StringComparison.OrdinalIgnoreCase))
        {
            return ("DNS", settings.Dns);
        }

        return ("API", settings.Info);
    }
}
