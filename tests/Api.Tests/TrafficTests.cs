using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using GeiseIT.LookingGlass.Api.Services;
using GeiseIT.LookingGlass.Contracts;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.Tests;

public class TrafficServiceTests
{
    private readonly FakePrometheusClient _prometheus = new();

    private TrafficService Create(Action<TrafficOptions>? configure = null)
    {
        var options = new TrafficOptions();
        configure?.Invoke(options);
        return new TrafficService(_prometheus, Options.Create(options), TimeProvider.System);
    }

    [Fact]
    public async Task Builds_anonymous_ordered_nodes_and_cluster_totals()
    {
        var result = await Create().GetAsync("1h", default);

        Assert.Equal(["Node 1", "Node 2", "Node 3"], result.Nodes.Select(n => n.Label));
        Assert.Equal(1_000_000, result.Nodes[0].Rx[0].BitsPerSecond);
        Assert.Equal(3_000_000, result.Nodes[2].Rx[0].BitsPerSecond);
        Assert.Equal(10_000_000_000, result.Nodes[0].CapacityBitsPerSecond);
        Assert.Null(result.Nodes[1].CapacityBitsPerSecond);
        Assert.Null(result.Nodes[0].Rx[2].BitsPerSecond);
        Assert.Equal(7_000_000, result.Current.ClusterRxBps);
        Assert.Equal(14_000_000, result.Current.ClusterTxBps);
        Assert.Equal(30, result.StepSeconds);
    }

    [Fact]
    public async Task Response_never_contains_hosts_addresses_or_interfaces()
    {
        var json = JsonSerializer.Serialize(await Create().GetAsync("1h", default), LookingGlassJson.Options);
        Assert.DoesNotContain("192.168", json);
        Assert.DoesNotContain("9100", json);
        Assert.DoesNotContain("instance", json);
        Assert.DoesNotContain("ens", json);
    }

    [Theory]
    [InlineData("1h", 30, 3600)]
    [InlineData("6h", 120, 21600)]
    [InlineData("24h", 300, 86400)]
    public async Task Ranges_map_to_window_and_step(string range, int step, int seconds)
    {
        var result = await Create().GetAsync(range, default);
        Assert.Equal(step, result.StepSeconds);
        Assert.All(_prometheus.Queries, q =>
        {
            Assert.Equal(step, q.Step);
            Assert.Equal(seconds, (int)q.Window.TotalSeconds);
        });
    }

    [Fact]
    public async Task Internet_is_unavailable_until_a_wan_device_is_configured_and_returns_data()
    {
        var unconfigured = await Create().GetAsync("1h", default);
        Assert.False(unconfigured.Internet.Available);
        Assert.Null(unconfigured.Current.InternetRxBps);
        Assert.DoesNotContain(_prometheus.Queries, q => q.Query.Contains("opnsense"));

        var empty = await Create(o => o.WanDevice = "igb0").GetAsync("6h", default);
        Assert.False(empty.Internet.Available);

        _prometheus.Respond = q => q.Contains("job=\"opnsense\"") ? [FakePrometheusClient.Series(null, 800_000, 900_000)] : [];
        var connected = await Create(o => o.WanDevice = "igb0").GetAsync("24h", default);
        Assert.True(connected.Internet.Available);
        Assert.Equal(900_000, connected.Current.InternetRxBps);
        Assert.Contains(_prometheus.Queries, q => q.Query.Contains("device=\"igb0\""));
    }

    [Fact]
    public async Task Web_traffic_is_reported_or_marked_unavailable()
    {
        var ok = await Create().GetAsync("1h", default);
        Assert.True(ok.Web.Available);
        Assert.Equal(120_000, ok.Current.WebInBps);
        Assert.Equal(1_600_000, ok.Current.WebOutBps);

        _prometheus.Respond = q => q.Contains("nginx_ingress") ? [] : FakePrometheusClient.DefaultResponse(q);
        var missing = await Create().GetAsync("6h", default);
        Assert.False(missing.Web.Available);
        Assert.Null(missing.Current.WebInBps);
    }

    [Fact]
    public async Task Optional_sources_failing_do_not_fail_the_page()
    {
        _prometheus.Respond = q => q.Contains("nginx_ingress") ? null : FakePrometheusClient.DefaultResponse(q);
        var result = await Create().GetAsync("24h", default);
        Assert.False(result.Web.Available);
        Assert.Equal(3, result.Nodes.Count);
    }

    [Fact]
    public async Task Prometheus_down_or_unconfigured_is_service_unavailable()
    {
        _prometheus.Respond = _ => null;
        var down = await Assert.ThrowsAsync<LookingGlassException>(() => Create().GetAsync("1h", default));
        Assert.Equal(ProblemCodes.ServiceUnavailable, down.Code);

        _prometheus.IsConfigured = false;
        var unconfigured = await Assert.ThrowsAsync<LookingGlassException>(() => Create().GetAsync("1h", default));
        Assert.Equal(ProblemCodes.ServiceUnavailable, unconfigured.Code);
    }

    [Fact]
    public async Task Results_are_cached_briefly_per_range()
    {
        var service = Create();
        await service.GetAsync("1h", default);
        var afterFirst = _prometheus.Queries.Count;
        await service.GetAsync("1h", default);
        Assert.Equal(afterFirst, _prometheus.Queries.Count);
        await service.GetAsync("6h", default);
        Assert.True(_prometheus.Queries.Count > afterFirst);
    }

    [Theory]
    [InlineData("1h", true)]
    [InlineData("6h", true)]
    [InlineData("24h", true)]
    [InlineData("2h", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("1h; drop", false)]
    public void Only_known_ranges_are_valid(string? range, bool valid) => Assert.Equal(valid, TrafficService.IsValidRange(range));
}

public class PrometheusClientTests
{
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public Uri? LastUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastUri = request.RequestUri;
            return Task.FromResult(respond(request));
        }
    }

    private static PrometheusClient Create(StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://prom.test/") }, Options.Create(new PrometheusOptions { BaseUrl = "http://prom.test" }));

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Parses_matrix_results_treating_nan_as_a_gap()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK,
            """{"status":"success","data":{"resultType":"matrix","result":[{"metric":{"instance":"a"},"values":[[1700000000,"12.5"],[1700000030,"NaN"],[1700000060,"+Inf"]]}]}}"""));
        var series = await Create(handler).QueryRangeAsync("up", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch.AddHours(1), 30, default);

        var points = Assert.Single(series).Points;
        Assert.Equal(12.5, points[0].BitsPerSecond);
        Assert.Null(points[1].BitsPerSecond);
        Assert.Null(points[2].BitsPerSecond);
        Assert.Contains("query=up", handler.LastUri!.Query);
        Assert.Contains("step=30", handler.LastUri.Query);
    }

    [Fact]
    public async Task Queries_are_url_encoded()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK, """{"status":"success","data":{"result":[]}}"""));
        await Create(handler).QueryRangeAsync("sum(rate(x{a=\"b\"}[1m])) * 8", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, 30, default);
        Assert.DoesNotContain("{", handler.LastUri!.Query);
        Assert.DoesNotContain("\"", handler.LastUri.Query);
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError, "oops")]
    [InlineData(HttpStatusCode.OK, "<html>")]
    [InlineData(HttpStatusCode.OK, """{"status":"error","error":"bad"}""")]
    [InlineData(HttpStatusCode.OK, "{}")]
    public async Task Failures_become_service_unavailable_without_details(HttpStatusCode status, string body)
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() =>
            Create(new StubHandler(_ => Json(status, body))).QueryRangeAsync("up", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, 30, default));
        Assert.Equal(ProblemCodes.ServiceUnavailable, ex.Code);
        Assert.DoesNotContain("bad", ex.Message);
    }

    [Fact]
    public async Task Connection_errors_become_service_unavailable()
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() =>
            Create(new StubHandler(_ => throw new HttpRequestException("refused"))).QueryRangeAsync("up", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, 30, default));
        Assert.Equal(503, ex.Status);
    }
}

public class TrafficEndpointTests
{
    [Fact]
    public async Task Endpoint_returns_the_documented_shape()
    {
        using var factory = new ApiFactory();
        var response = await factory.CreateClient().GetAsync("/api/v1/traffic?range=6h");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<TrafficResponse>(LookingGlassJson.Options);
        Assert.Equal("6h", body!.Range);
        Assert.Equal(120, body.StepSeconds);
        Assert.Equal(3, body.Nodes.Count);
        Assert.True(body.Web.Available);
        Assert.False(body.Internet.Available);
    }

    [Fact]
    public async Task Default_range_is_one_hour()
    {
        using var factory = new ApiFactory();
        var body = await factory.CreateClient().GetFromJsonAsync<TrafficResponse>("/api/v1/traffic", LookingGlassJson.Options);
        Assert.Equal("1h", body!.Range);
    }

    [Theory]
    [InlineData("2h")]
    [InlineData("1h;id")]
    [InlineData("%7Bevil%7D")]
    public async Task Invalid_ranges_are_rejected(string range)
    {
        using var factory = new ApiFactory();
        var response = await factory.CreateClient().GetAsync($"/api/v1/traffic?range={range}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(factory.Prometheus.Queries);
    }

    [Fact]
    public async Task Prometheus_outage_returns_a_503_problem()
    {
        using var factory = new ApiFactory();
        factory.Prometheus.Respond = _ => null;
        var response = await factory.CreateClient().GetAsync("/api/v1/traffic");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("service_unavailable", problem.GetProperty("code").GetString());
    }
}

public class TrafficOptionsTests
{
    private static bool IsValid(TrafficOptions options) =>
        Validator.TryValidateObject(options, new ValidationContext(options), null, validateAllProperties: true);

    [Theory]
    [InlineData("igb0", true)]
    [InlineData("ix0.10", true)]
    [InlineData("", true)]
    [InlineData("igb0\"}", false)]
    [InlineData("a b", false)]
    [InlineData("x{y}", false)]
    public void Wan_device_is_restricted_to_safe_characters(string device, bool valid) =>
        Assert.Equal(valid, IsValid(new TrafficOptions { WanDevice = device }));

    [Theory]
    [InlineData("(eno|ens|enp|eth)[0-9a-z]*", true)]
    [InlineData("eth.*", true)]
    [InlineData("a\"} or vector(1) #", false)]
    [InlineData("a{2}", false)]
    [InlineData("a\\b", false)]
    public void Device_regex_cannot_break_out_of_the_query(string regex, bool valid) =>
        Assert.Equal(valid, IsValid(new TrafficOptions { NodeDeviceRegex = regex }));
}
