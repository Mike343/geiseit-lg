using System.Net;
using System.Text;
using GeiseIT.LookingGlass.Api;
using GeiseIT.LookingGlass.Api.Services;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.Tests;

public class StatusServiceTests
{
    private static ComponentStatus C(string id, ServiceStatus status) => new() { Id = id, Status = status };

    [Fact]
    public void All_operational_is_operational_and_ignores_unconfigured_optional_parts()
    {
        Assert.Equal(ServiceStatus.Operational, StatusService.Overall(
        [
            C("web", ServiceStatus.Operational),
            C("api", ServiceStatus.Operational),
            C("diagnostics", ServiceStatus.Operational),
            C("bgp", ServiceStatus.NotConfigured),
            C("ipv4", ServiceStatus.Operational),
            C("ipv6", ServiceStatus.Operational),
        ]));
    }

    [Fact]
    public void Diagnostics_outage_is_an_outage()
    {
        Assert.Equal(ServiceStatus.Outage, StatusService.Overall(
        [
            C("web", ServiceStatus.Operational),
            C("api", ServiceStatus.Operational),
            C("diagnostics", ServiceStatus.Outage),
            C("ipv4", ServiceStatus.Degraded),
        ]));
    }

    [Fact]
    public void One_family_down_is_degraded_but_both_down_is_an_outage()
    {
        var core = new[] { C("web", ServiceStatus.Operational), C("api", ServiceStatus.Operational), C("diagnostics", ServiceStatus.Operational) };
        Assert.Equal(ServiceStatus.Degraded, StatusService.Overall([.. core, C("ipv4", ServiceStatus.Operational), C("ipv6", ServiceStatus.Outage)]));
        Assert.Equal(ServiceStatus.Outage, StatusService.Overall([.. core, C("ipv4", ServiceStatus.Outage), C("ipv6", ServiceStatus.Outage)]));
        Assert.Equal(ServiceStatus.Operational, StatusService.Overall([.. core, C("ipv4", ServiceStatus.Operational), C("ipv6", ServiceStatus.NotConfigured)]));
    }

    [Fact]
    public async Task Builds_components_from_real_backend_signals()
    {
        var client = new FakeDiagnosticsClient { Ready = 4.26 };
        client.Performance = () => new PerformanceResponse
        {
            Ipv4 = new FamilyPerformance { Status = ServiceStatus.Operational, AvgLatencyMs = 12.7, Samples = [new LatencySample(DateTimeOffset.UtcNow, 12.7)] },
            Ipv6 = new FamilyPerformance { Status = ServiceStatus.Outage, Samples = [new LatencySample(DateTimeOffset.UtcNow, null)] },
        };
        var service = new StatusService(client, new DisabledBgpProvider(Options.Create(new BgpOptions())), TimeProvider.System);

        var status = await service.GetAsync(default);

        Assert.Equal(ServiceStatus.Degraded, status.Overall);
        Assert.Equal(4.3, status.Components.Single(c => c.Id == "diagnostics").LatencyMs);
        Assert.Equal("Average latency 12.7 ms", status.Components.Single(c => c.Id == "ipv4").Detail);
        Assert.Equal("No IPv6 connectivity detected.", status.Components.Single(c => c.Id == "ipv6").Detail);
        Assert.Equal(ServiceStatus.NotConfigured, status.Components.Single(c => c.Id == "bgp").Status);
    }

    [Fact]
    public async Task Diagnostics_down_is_reported_not_thrown()
    {
        var client = new FakeDiagnosticsClient { Ready = null };
        client.Performance = () => throw LookingGlassException.Unavailable("down");
        var service = new StatusService(client, new DisabledBgpProvider(Options.Create(new BgpOptions())), TimeProvider.System);

        var status = await service.GetAsync(default);

        Assert.Equal(ServiceStatus.Outage, status.Overall);
        Assert.Equal(ServiceStatus.Outage, status.Components.Single(c => c.Id == "diagnostics").Status);
        Assert.Equal(ServiceStatus.Degraded, status.Components.Single(c => c.Id == "ipv4").Status);
        Assert.Equal(ServiceStatus.Operational, status.Components.Single(c => c.Id == "api").Status);
    }
}

public class ClientIpHasherTests
{
    [Fact]
    public void Hashes_are_stable_within_a_day_distinct_per_client_and_do_not_contain_the_ip()
    {
        var hasher = new ClientIpHasher(TimeProvider.System);
        var a = hasher.Hash("203.0.113.9");
        Assert.Equal(a, hasher.Hash("203.0.113.9"));
        Assert.NotEqual(a, hasher.Hash("203.0.113.10"));
        Assert.DoesNotContain("203", a);
        Assert.Equal(12, a.Length);
        Assert.Equal("unknown", hasher.Hash(null));
    }

    [Fact]
    public void Hashes_are_not_linkable_across_days()
    {
        var clock = new MutableClock(new DateTimeOffset(2026, 9, 24, 10, 0, 0, TimeSpan.Zero));
        var hasher = new ClientIpHasher(clock);
        var day1 = hasher.Hash("203.0.113.9");
        clock.Now = clock.Now.AddDays(1);
        Assert.NotEqual(day1, hasher.Hash("203.0.113.9"));
    }

    private sealed class MutableClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }
}

public class ActivityLogTests
{
    private sealed class MutableClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    [Fact]
    public void Keeps_newest_first_within_the_cap_and_expires_old_entries()
    {
        var clock = new MutableClock(DateTimeOffset.UtcNow);
        var log = new ActivityLog(Options.Create(new ActivityOptions { MaxItems = 2, RetentionMinutes = 10 }), clock);

        log.Add("ping", "a.example.com", "1");
        log.Add("ping", "b.example.com", "2");
        log.Add("ping", "c.example.com", "3");
        Assert.Equal(["c.example.com", "b.example.com"], log.Snapshot().Items.Select(i => i.Target));

        clock.Now = clock.Now.AddMinutes(11);
        Assert.Empty(log.Snapshot().Items);
    }
}

public class DiagnosticsClientTests
{
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public HttpRequestMessage? Last { get; private set; }

        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Last = request;
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return respond(request);
        }
    }

    private static DiagnosticsClient Create(StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://diagnostics.test/") });

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Posts_the_body_and_forwards_the_request_id()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK, """{"requestId":"abc-12345678","type":"ping","destination":"8.8.8.8","family":"ipv4","transmitted":5,"received":5}"""));
        var response = await Create(handler).PostAsync<PingResponse>("ping", new DestinationRequest { Destination = "8.8.8.8", Family = IpFamily.Ipv6 }, "abc-12345678", default);

        Assert.Equal("8.8.8.8", response.Destination);
        Assert.Equal("/internal/v1/ping", handler.Last!.RequestUri!.AbsolutePath);
        Assert.Equal("abc-12345678", handler.Last.Headers.GetValues("X-Request-Id").Single());
        Assert.Contains("\"family\":\"ipv6\"", handler.LastBody);
    }

    [Fact]
    public async Task Maps_problem_responses_to_exceptions()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.TooManyRequests, """{"code":"busy","detail":"Slow down","retryAfterSeconds":9,"status":503}"""));
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => Create(handler).PostAsync<PingResponse>("ping", new DestinationRequest(), "abc-12345678", default));
        Assert.Equal("busy", ex.Code);
        Assert.Equal("Slow down", ex.Message);
        Assert.Equal(9, ex.RetryAfterSeconds);
        Assert.Equal(429, ex.Status);
    }

    [Theory]
    [InlineData("<html>bad gateway</html>")]
    [InlineData("")]
    [InlineData("{\"unrelated\":true}")]
    public async Task Unreadable_error_bodies_become_service_unavailable(string body)
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.BadGateway, body));
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => Create(handler).PostAsync<PingResponse>("ping", new DestinationRequest(), "abc-12345678", default));
        Assert.Equal(ProblemCodes.ServiceUnavailable, ex.Code);
    }

    [Fact]
    public async Task Connection_failures_become_service_unavailable()
    {
        var handler = new StubHandler(_ => throw new HttpRequestException("connection refused"));
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => Create(handler).PostAsync<PingResponse>("ping", new DestinationRequest(), "abc-12345678", default));
        Assert.Equal(ProblemCodes.ServiceUnavailable, ex.Code);
        Assert.Equal(503, ex.Status);
    }

    [Fact]
    public async Task Caller_cancellation_is_not_masked()
    {
        var handler = new StubHandler(_ => throw new TaskCanceledException());
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Create(handler).PostAsync<PingResponse>("ping", new DestinationRequest(), "abc-12345678", cts.Token));
    }

    [Fact]
    public async Task Ready_check_reports_latency_or_null()
    {
        Assert.NotNull(await Create(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK))).CheckReadyAsync(default));
        Assert.Null(await Create(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))).CheckReadyAsync(default));
        Assert.Null(await Create(new StubHandler(_ => throw new HttpRequestException())).CheckReadyAsync(default));
    }
}

public class ConfigurationAliasTests
{
    [Fact]
    public void Friendly_environment_variables_map_to_configuration_and_explicit_keys_win()
    {
        Environment.SetEnvironmentVariable("LOOKING_GLASS_LOCATION", "Chicago");
        Environment.SetEnvironmentVariable("RATE_LIMIT_PING", "7");
        Environment.SetEnvironmentVariable("RateLimiting__Ping__PermitLimit", "9");
        try
        {
            var configuration = new ConfigurationBuilder().AddEnvironmentAliases().Build();
            Assert.Equal("Chicago", configuration["LookingGlass:Location"]);
            Assert.Equal("9", configuration["RateLimiting:Ping:PermitLimit"]);
        }
        finally
        {
            Environment.SetEnvironmentVariable("LOOKING_GLASS_LOCATION", null);
            Environment.SetEnvironmentVariable("RATE_LIMIT_PING", null);
            Environment.SetEnvironmentVariable("RateLimiting__Ping__PermitLimit", null);
        }
    }

    [Theory]
    [InlineData("a,b", 2)]
    [InlineData(" a , b ; c ", 3)]
    [InlineData("", 0)]
    [InlineData(null, 0)]
    public void Splits_lists(string? csv, int count) => Assert.Equal(count, LookingGlassConfiguration.SplitList(csv).Length);
}
