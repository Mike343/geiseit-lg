using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using OpenTelemetry;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Prometheus;

namespace GeiseIT.LookingGlass.Contracts.Hosting;

public static class HostingExtensions
{
    public const int DefaultManagementPort = 9090;

    public static string ApplicationVersion { get; } =
        (Assembly.GetEntryAssembly()?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0")
        .Split('+')[0];

    public static WebApplicationBuilder AddLookingGlassDefaults(this WebApplicationBuilder builder, string serviceName)
    {
        builder.Configuration.AddEnvironmentAliases();

        builder.Logging.ClearProviders();
        builder.Logging.AddJsonConsole(options =>
        {
            options.IncludeScopes = true;
            options.UseUtcTimestamp = true;
            options.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
        });

        builder.Services.Configure<JsonOptions>(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = LookingGlassJson.Options.PropertyNamingPolicy;
            options.SerializerOptions.PropertyNameCaseInsensitive = true;
            foreach (var converter in LookingGlassJson.Options.Converters)
            {
                options.SerializerOptions.Converters.Add(converter);
            }
        });

        var telemetry = builder.Services
            .AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(serviceName, serviceVersion: ApplicationVersion))
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation(o => o.Filter = ctx =>
                    !ctx.Request.Path.StartsWithSegments("/health") && !ctx.Request.Path.StartsWithSegments("/metrics"))
                .AddHttpClientInstrumentation());

        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            telemetry.UseOtlpExporter();
        }

        return builder;
    }

    public static int GetManagementPort(this IConfiguration configuration) =>
        configuration.GetValue("Management:Port", DefaultManagementPort);

    public static WebApplication UseLookingGlassPortSeparation(this WebApplication app)
    {
        var port = app.Configuration.GetManagementPort();
        app.Use(async (context, next) =>
        {
            var management = context.Connection.LocalPort == port;
            var metrics = context.Request.Path.StartsWithSegments("/metrics");
            if (management != metrics)
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            await next();
        });
        app.MapMetrics();
        return app;
    }
}
