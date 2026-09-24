using System.Net;
using GeiseIT.LookingGlass.Api;
using GeiseIT.LookingGlass.Api.Metrics;
using GeiseIT.LookingGlass.Api.RateLimiting;
using GeiseIT.LookingGlass.Api.Services;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using GeiseIT.LookingGlass.Contracts.Networking;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);
builder.AddLookingGlassDefaults("looking-glass-api");
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    options.Limits.MaxRequestBodySize = 2048;
    options.Limits.MaxRequestLineSize = 4096;
});

builder.Services.AddOptions<LookingGlassOptions>().BindConfiguration(LookingGlassOptions.Section);
builder.Services.AddOptions<DiagnosticsClientOptions>().BindConfiguration(DiagnosticsClientOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<RateLimitingOptions>().BindConfiguration(RateLimitingOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<NetworkOptions>().BindConfiguration(NetworkOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<SecurityOptions>().BindConfiguration(SecurityOptions.Section);
builder.Services.AddOptions<ActivityOptions>().BindConfiguration(ActivityOptions.Section).ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<BgpOptions>().BindConfiguration(BgpOptions.Section);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(sp =>
{
    var security = sp.GetRequiredService<IOptions<SecurityOptions>>().Value;
    return new DestinationPolicy(
        new IpBlocklist(LookingGlassConfiguration.SplitList(security.ExtraBlockedCidrs)),
        LookingGlassConfiguration.SplitList(security.ExtraBlockedSuffixes));
});
builder.Services.AddSingleton<ClientIpHasher>();
builder.Services.AddSingleton<ActivityLog>();
builder.Services.AddSingleton<DiagnosticRelay>();
builder.Services.AddSingleton<NetworkInfoService>();
builder.Services.AddSingleton<StatusService>();
builder.Services.AddSingleton<IBgpProvider, DisabledBgpProvider>();
builder.Services.AddSingleton<TtlCache<PerformanceResponse>>(sp => new TtlCache<PerformanceResponse>(TimeSpan.FromSeconds(10), sp.GetRequiredService<TimeProvider>()));

builder.Services.AddHttpClient<IDiagnosticsClient, DiagnosticsClient>((sp, client) =>
{
    var settings = sp.GetRequiredService<IOptions<DiagnosticsClientOptions>>().Value;
    client.BaseAddress = new Uri(settings.BaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(settings.TimeoutSeconds + 10);
});

builder.Services.AddLookingGlassRateLimiting();
builder.Services.AddSingleton<ConcurrencyTracker>();
builder.Services.AddHealthChecks();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    var network = builder.Configuration.GetSection(NetworkOptions.Section).Get<NetworkOptions>() ?? new NetworkOptions();
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = network.ForwardLimit;
    options.KnownProxies.Clear();
    options.KnownIPNetworks.Clear();
    foreach (var entry in LookingGlassConfiguration.SplitList(network.TrustedProxies))
    {
        if (entry.Contains('/'))
        {
            options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(entry));
        }
        else
        {
            options.KnownProxies.Add(IPAddress.Parse(entry));
        }
    }
});

var app = builder.Build();

ApiMetrics.Initialize();
app.UseLookingGlassPortSeparation();
app.UseForwardedHeaders();
app.UseMiddleware<RequestIdMiddleware>();
app.UseLookingGlassProblems();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseHttpMetrics();
app.UseRateLimiter();
app.UseMiddleware<ConcurrencyGuard>();

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready");

var api = app.MapGroup("/api/v1");

var diagnostics = api.MapGroup("/diagnostics");
diagnostics.MapPost("/ping", async (DestinationRequest? body, DiagnosticRelay relay, HttpContext context) =>
    Results.Json(await relay.PingAsync(context, body), LookingGlassJson.Options)).RequireRateLimiting(RateLimitPolicies.Ping);
diagnostics.MapPost("/traceroute", async (DestinationRequest? body, DiagnosticRelay relay, HttpContext context) =>
    Results.Json(await relay.TracerouteAsync(context, body), LookingGlassJson.Options)).RequireRateLimiting(RateLimitPolicies.Traceroute);
diagnostics.MapPost("/mtr", async (DestinationRequest? body, DiagnosticRelay relay, HttpContext context) =>
    Results.Json(await relay.MtrAsync(context, body), LookingGlassJson.Options)).RequireRateLimiting(RateLimitPolicies.Mtr);
diagnostics.MapPost("/dns", async (DnsLookupRequest? body, DiagnosticRelay relay, HttpContext context) =>
    Results.Json(await relay.DnsAsync(context, body), LookingGlassJson.Options)).RequireRateLimiting(RateLimitPolicies.Dns);

var info = api.MapGroup(string.Empty).RequireRateLimiting(RateLimitPolicies.Info);
info.MapGet("/status", async (StatusService service, HttpContext context) =>
    Results.Json(await service.GetAsync(context.RequestAborted), LookingGlassJson.Options));
info.MapGet("/network", async (NetworkInfoService service, HttpContext context) =>
    Results.Json(await service.GetAsync(context.RequestAborted), LookingGlassJson.Options));
info.MapGet("/network/performance", async (TtlCache<PerformanceResponse> cache, IDiagnosticsClient client, HttpContext context) =>
    Results.Json(await cache.GetAsync(client.GetPerformanceAsync, context.RequestAborted), LookingGlassJson.Options));
info.MapGet("/activity", (ActivityLog log) =>
    Results.Json(log.Snapshot(), LookingGlassJson.Options));

var bgp = info.MapGroup("/bgp");
bgp.MapGet("/routes", async (IBgpProvider provider, HttpContext context) =>
    Results.Json(await provider.QueryAsync<object>("routes", null, context.RequestAborted), LookingGlassJson.Options));
bgp.MapGet("/prefix/{**prefix}", async (string prefix, IBgpProvider provider, HttpContext context) =>
    Results.Json(await provider.QueryAsync<object>("prefix", prefix, context.RequestAborted), LookingGlassJson.Options));
bgp.MapGet("/asn/{asn}", async (string asn, IBgpProvider provider, HttpContext context) =>
    Results.Json(await provider.QueryAsync<object>("asn", asn, context.RequestAborted), LookingGlassJson.Options));
bgp.MapGet("/sessions", async (IBgpProvider provider, HttpContext context) =>
    Results.Json(await provider.QueryAsync<object>("sessions", null, context.RequestAborted), LookingGlassJson.Options));

app.Run();

public partial class Program;
