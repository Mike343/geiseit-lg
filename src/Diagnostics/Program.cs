using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics;
using GeiseIT.LookingGlass.Diagnostics.Connectivity;
using GeiseIT.LookingGlass.Diagnostics.Dns;
using GeiseIT.LookingGlass.Diagnostics.Execution;
using GeiseIT.LookingGlass.Diagnostics.Metrics;
using GeiseIT.LookingGlass.Diagnostics.Probes;
using GeiseIT.LookingGlass.Diagnostics.Security;
using GeiseIT.LookingGlass.Diagnostics.Services;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);
builder.AddLookingGlassDefaults("looking-glass-diagnostics");
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    options.Limits.MaxRequestBodySize = 4096;
});

builder.Services.AddOptions<DiagnosticsOptions>().BindConfiguration(DiagnosticsOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<DnsOptions>().BindConfiguration(DnsOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<ConnectivityOptions>().BindConfiguration(ConnectivityOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<EgressOptions>().BindConfiguration(EgressOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<SecurityOptions>().BindConfiguration(SecurityOptions.Section);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(sp =>
{
    var security = sp.GetRequiredService<IOptions<SecurityOptions>>().Value;
    return new DestinationPolicy(
        new IpBlocklist(LookingGlassConfiguration.SplitList(security.ExtraBlockedCidrs)),
        LookingGlassConfiguration.SplitList(security.ExtraBlockedSuffixes));
});
builder.Services.AddSingleton<IDnsQuery, DnsClientQuery>();
builder.Services.AddSingleton<IHostResolver, HostResolver>();
builder.Services.AddSingleton<TargetResolver>();
builder.Services.AddSingleton<IProcessRunner, ProcessRunner>();
builder.Services.AddSingleton<DiagnosticsExecutor>();
builder.Services.AddSingleton<IProbeRunner>(sp =>
    sp.GetRequiredService<IOptions<DiagnosticsOptions>>().Value.Simulated
        ? new SimulatedProbeRunner()
        : ActivatorUtilities.CreateInstance<NativeProbeRunner>(sp));
builder.Services.AddSingleton<DiagnosticsService>();
builder.Services.AddSingleton<DnsLookupService>();
builder.Services.AddSingleton<IConnectivityProbe, TcpConnectivityProbe>();
builder.Services.AddSingleton<ConnectivityMonitor>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ConnectivityMonitor>());
builder.Services.AddSingleton<EgressService>();
builder.Services.AddHealthChecks().AddCheck<ToolsHealthCheck>("tools", tags: ["ready"]);

var app = builder.Build();

DiagnosticsMetrics.Initialize();
app.UseLookingGlassPortSeparation();
app.UseMiddleware<RequestIdMiddleware>();
app.UseLookingGlassProblems();
app.UseHttpMetrics();

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

var api = app.MapGroup("/internal/v1");
api.MapPost("/ping", async (DestinationRequest? body, DiagnosticsService service, HttpContext context) =>
    Results.Json(await service.PingAsync(body, context.TraceIdentifier, context.RequestAborted), LookingGlassJson.Options));
api.MapPost("/traceroute", async (DestinationRequest? body, DiagnosticsService service, HttpContext context) =>
    Results.Json(await service.TracerouteAsync(body, context.TraceIdentifier, context.RequestAborted), LookingGlassJson.Options));
api.MapPost("/mtr", async (DestinationRequest? body, DiagnosticsService service, HttpContext context) =>
    Results.Json(await service.MtrAsync(body, context.TraceIdentifier, context.RequestAborted), LookingGlassJson.Options));
api.MapPost("/dns", async (DnsLookupRequest? body, DnsLookupService service, HttpContext context) =>
    Results.Json(await service.LookupAsync(body, context.TraceIdentifier, context.RequestAborted), LookingGlassJson.Options));
api.MapGet("/connectivity", (ConnectivityMonitor monitor) =>
    Results.Json(monitor.Snapshot(), LookingGlassJson.Options));
api.MapGet("/egress", async (EgressService egress, HttpContext context) =>
    Results.Json(await egress.GetAsync(context.RequestAborted), LookingGlassJson.Options));

app.Run();

public partial class Program;
