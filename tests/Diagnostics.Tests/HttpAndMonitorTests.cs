using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Connectivity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Tests;

public class DiagnosticsApiTests(DiagnosticsApiTests.Factory factory) : IClassFixture<DiagnosticsApiTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("Diagnostics:Simulated", "true");
            builder.UseSetting("Connectivity:Enabled", "false");
            builder.UseSetting("Egress:Enabled", "false");
        }
    }

    private readonly HttpClient _client = factory.CreateClient();

    private static StringContent Json(string body, string mediaType = "application/json") =>
        new(body, Encoding.UTF8, mediaType);

    private static async Task<JsonElement> Problem(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        return (await response.Content.ReadFromJsonAsync<JsonElement>());
    }

    [Fact]
    public async Task Ping_round_trips_with_the_shared_contract()
    {
        var response = await _client.PostAsync("/internal/v1/ping", Json("""{"destination":"8.8.8.8","family":"ipv4"}"""));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<PingResponse>(LookingGlassJson.Options);
        Assert.Equal("8.8.8.8", body!.ResolvedAddress);
        Assert.True(body.Simulated);
        Assert.Equal(body.RequestId, response.Headers.GetValues("X-Request-Id").Single());
    }

    [Theory]
    [InlineData("""{oops""")]
    [InlineData("""{"destination":"8.8.8.8","family":"bogus"}""")]
    [InlineData("""[1,2,3]""")]
    public async Task Malformed_json_is_a_400_problem(string body)
    {
        var response = await _client.PostAsync("/internal/v1/ping", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", (await Problem(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Missing_destination_is_a_validation_problem()
    {
        var response = await _client.PostAsync("/internal/v1/ping", Json("{}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", (await Problem(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Overlong_destinations_are_rejected()
    {
        var response = await _client.PostAsync("/internal/v1/ping", Json($$"""{"destination":"{{new string('a', 10000)}}"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", (await Problem(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Non_json_content_types_are_rejected()
    {
        var response = await _client.PostAsync("/internal/v1/ping", Json("destination=8.8.8.8", "text/plain"));
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal("unsupported_media_type", (await Problem(response)).GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("ping", "10.0.0.1")]
    [InlineData("traceroute", "127.0.0.1")]
    [InlineData("mtr", "169.254.169.254")]
    [InlineData("ping", "localhost")]
    public async Task Private_destinations_are_blocked_with_422(string operation, string destination)
    {
        var response = await _client.PostAsync($"/internal/v1/{operation}", Json($$"""{"destination":"{{destination}}"}"""));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("destination_blocked", (await Problem(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Request_ids_are_adopted_when_valid_and_replaced_when_not()
    {
        var good = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/ping") { Content = Json("""{"destination":"8.8.8.8"}""") };
        good.Headers.Add("X-Request-Id", "abc-12345678");
        Assert.Equal("abc-12345678", (await _client.SendAsync(good)).Headers.GetValues("X-Request-Id").Single());

        var bad = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/ping") { Content = Json("""{"destination":"8.8.8.8"}""") };
        bad.Headers.Add("X-Request-Id", "bad id\"; drop");
        var echoed = (await _client.SendAsync(bad)).Headers.GetValues("X-Request-Id").Single();
        Assert.NotEqual("bad id\"; drop", echoed);
        Assert.Matches("^[A-Za-z0-9-]{8,64}$", echoed);
    }

    [Fact]
    public async Task Health_endpoints_respond_and_metrics_are_not_on_the_public_port()
    {
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/metrics")).StatusCode);
    }

    [Fact]
    public async Task Management_port_serves_only_metrics()
    {
        async Task<int> Send(string path, int localPort)
        {
            var context = await factory.Server.SendAsync(c =>
            {
                c.Request.Method = "GET";
                c.Request.Path = path;
                c.Connection.LocalPort = localPort;
            });
            return context.Response.StatusCode;
        }

        Assert.Equal(200, await Send("/metrics", 9090));
        Assert.Equal(404, await Send("/internal/v1/connectivity", 9090));
        Assert.Equal(404, await Send("/metrics", 8080));
    }

    [Fact]
    public async Task Dns_endpoint_validates_record_type()
    {
        var response = await _client.PostAsync("/internal/v1/dns", Json("""{"name":"example.com","recordType":"AXFR"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

public class ConnectivityMonitorTests
{
    private sealed class ScriptedProbe(Func<System.Net.IPEndPoint, double?> script) : IConnectivityProbe
    {
        public Task<double?> ProbeAsync(System.Net.IPEndPoint target, TimeSpan timeout, CancellationToken cancellationToken) =>
            Task.FromResult(script(target));
    }

    private static ConnectivityMonitor Create(Func<System.Net.IPEndPoint, double?> script, Action<ConnectivityOptions>? configure = null)
    {
        var options = new ConnectivityOptions();
        configure?.Invoke(options);
        return new ConnectivityMonitor(Options.Create(options), new ScriptedProbe(script), TimeProvider.System, NullLogger<ConnectivityMonitor>.Instance);
    }

    [Fact]
    public async Task Reports_per_family_status_latency_and_uptime()
    {
        var monitor = Create(t => t.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork ? 12.5 : null);
        await monitor.SampleOnceAsync(default);
        await monitor.SampleOnceAsync(default);

        var snapshot = monitor.Snapshot();
        Assert.Equal(ServiceStatus.Operational, snapshot.Ipv4.Status);
        Assert.Equal(12.5, snapshot.Ipv4.AvgLatencyMs);
        Assert.Equal(100, snapshot.Ipv4.UptimePercent);
        Assert.Equal(ServiceStatus.Outage, snapshot.Ipv6.Status);
        Assert.Null(snapshot.Ipv6.AvgLatencyMs);
        Assert.Equal(0, snapshot.Ipv6.UptimePercent);
        Assert.Equal(12.5, snapshot.AvgLatencyMs);
        Assert.Equal(2, snapshot.Ipv4.Samples.Count);
    }

    [Fact]
    public async Task Falls_back_to_the_next_target_when_the_first_fails()
    {
        var monitor = Create(t => t.Address.ToString() == "8.8.8.8" ? 20 : null, o => o.Ipv6Targets = string.Empty);
        await monitor.SampleOnceAsync(default);
        var snapshot = monitor.Snapshot();
        Assert.Equal(20, snapshot.Ipv4.AvgLatencyMs);
        Assert.Equal(ServiceStatus.NotConfigured, snapshot.Ipv6.Status);
    }

    [Fact]
    public async Task Intermittent_failure_is_degraded_not_outage()
    {
        var calls = 0;
        var monitor = Create(_ => ++calls % 4 == 0 ? null : 10, o =>
        {
            o.Ipv4Targets = "1.1.1.1:443";
            o.Ipv6Targets = string.Empty;
        });
        for (var i = 0; i < 4; i++)
        {
            await monitor.SampleOnceAsync(default);
        }

        Assert.Equal(ServiceStatus.Degraded, monitor.Snapshot().Ipv4.Status);
    }

    [Fact]
    public async Task Long_histories_are_downsampled()
    {
        var monitor = Create(_ => 5, o => o.Ipv6Targets = string.Empty);
        for (var i = 0; i < 400; i++)
        {
            await monitor.SampleOnceAsync(default);
        }

        Assert.True(monitor.Snapshot().Ipv4.Samples.Count <= 288);
    }

    [Fact]
    public void Invalid_targets_are_ignored()
    {
        var monitor = Create(_ => 1, o =>
        {
            o.Ipv4Targets = "not-an-ip:443,1.1.1.1";
            o.Ipv6Targets = "1.1.1.1:443";
        });
        Assert.Equal(ServiceStatus.NotConfigured, monitor.Snapshot().Ipv4.Status);
        Assert.Equal(ServiceStatus.NotConfigured, monitor.Snapshot().Ipv6.Status);
    }

    [Fact]
    public void Before_the_first_sample_status_is_degraded_with_no_samples()
    {
        var snapshot = Create(_ => 1).Snapshot();
        Assert.Equal(ServiceStatus.Degraded, snapshot.Ipv4.Status);
        Assert.Empty(snapshot.Ipv4.Samples);
    }
}
