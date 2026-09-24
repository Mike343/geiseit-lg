using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using GeiseIT.LookingGlass.Contracts;

namespace GeiseIT.LookingGlass.Api.Tests;

public class ApiEndpointTests
{
    private static StringContent Json(string body, string mediaType = "application/json") =>
        new(body, Encoding.UTF8, mediaType);

    private static async Task<JsonElement> Problem(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Valid_requests_are_forwarded_with_the_request_id()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/diagnostics/ping", Json("""{"destination":"8.8.8.8"}"""));

        response.EnsureSuccessStatusCode();
        var call = Assert.Single(factory.Diagnostics.Calls);
        Assert.Equal("ping", call.Operation);
        Assert.Equal(response.Headers.GetValues("X-Request-Id").Single(), call.RequestId);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }

    [Theory]
    [InlineData("8.8.8.8; rm -rf /")]
    [InlineData("$(whoami).example.com")]
    [InlineData("http://example.com")]
    [InlineData("example.com/../../etc/passwd")]
    [InlineData("-c 100 8.8.8.8")]
    [InlineData("8.8.8.8\n1.1.1.1")]
    [InlineData("")]
    public async Task Malicious_or_malformed_destinations_never_reach_diagnostics(string destination)
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        var body = JsonSerializer.Serialize(new { destination });
        var response = await client.PostAsync("/api/v1/diagnostics/traceroute", Json(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", (await Problem(response)).GetProperty("code").GetString());
        Assert.Empty(factory.Diagnostics.Calls);
    }

    [Theory]
    [InlineData("10.0.0.5")]
    [InlineData("192.168.1.1")]
    [InlineData("172.20.0.1")]
    [InlineData("100.64.0.1")]
    [InlineData("127.0.0.1")]
    [InlineData("169.254.169.254")]
    [InlineData("::1")]
    [InlineData("fd00::1")]
    [InlineData("fe80::1")]
    [InlineData("224.0.0.251")]
    [InlineData("localhost")]
    [InlineData("kubernetes.default.svc.cluster.local")]
    [InlineData("metadata.google.internal")]
    public async Task Restricted_destinations_are_blocked_with_422(string destination)
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        foreach (var operation in new[] { "ping", "traceroute", "mtr" })
        {
            var response = await client.PostAsync($"/api/v1/diagnostics/{operation}", Json(JsonSerializer.Serialize(new { destination })));
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            Assert.Equal("destination_blocked", (await Problem(response)).GetProperty("code").GetString());
        }

        Assert.Empty(factory.Diagnostics.Calls);
    }

    [Fact]
    public async Task Dns_validates_record_type_and_name()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/v1/diagnostics/dns", Json("""{"name":"example.com","recordType":"AXFR"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/v1/diagnostics/dns", Json("""{"name":"example.com; id","recordType":"A"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync("/api/v1/diagnostics/dns", Json("""{"name":"db.internal","recordType":"A"}"""))).StatusCode);
        Assert.Empty(factory.Diagnostics.Calls);

        var ok = await client.PostAsync("/api/v1/diagnostics/dns", Json("""{"name":"example.com","recordType":"a"}"""));
        ok.EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData("{oops")]
    [InlineData("[1]")]
    [InlineData("""{"destination":"8.8.8.8","family":"bogus"}""")]
    public async Task Malformed_json_is_a_400_problem(string body)
    {
        using var factory = new ApiFactory();
        var response = await factory.CreateClient().PostAsync("/api/v1/diagnostics/ping", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", (await Problem(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Missing_fields_and_non_json_content_are_rejected()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/v1/diagnostics/ping", Json("{}"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/v1/diagnostics/ping", Json(string.Empty))).StatusCode);

        var wrongType = await client.PostAsync("/api/v1/diagnostics/ping", Json("destination=8.8.8.8", "text/plain"));
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, wrongType.StatusCode);
        Assert.Equal("unsupported_media_type", (await Problem(wrongType)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Unknown_routes_and_methods_return_problem_json()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        var notFound = await client.GetAsync("/api/v1/nope");
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
        await Problem(notFound);

        var wrongMethod = await client.GetAsync("/api/v1/diagnostics/ping");
        Assert.Equal(HttpStatusCode.MethodNotAllowed, wrongMethod.StatusCode);
        await Problem(wrongMethod);
    }

    [Theory]
    [InlineData(503, ProblemCodes.Busy)]
    [InlineData(504, ProblemCodes.Timeout)]
    [InlineData(502, ProblemCodes.DiagnosticFailed)]
    [InlineData(503, ProblemCodes.ServiceUnavailable)]
    public async Task Backend_problems_are_translated_faithfully(int status, string code)
    {
        using var factory = new ApiFactory();
        factory.Diagnostics.Respond = (_, _) => throw new LookingGlassException(code, status, "backend said no", 7);
        var response = await factory.CreateClient().PostAsync("/api/v1/diagnostics/ping", Json("""{"destination":"8.8.8.8"}"""));

        Assert.Equal((HttpStatusCode)status, response.StatusCode);
        var problem = await Problem(response);
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.Equal("backend said no", problem.GetProperty("detail").GetString());
        Assert.Equal(7, problem.GetProperty("retryAfterSeconds").GetInt32());
        Assert.Equal("7", response.Headers.GetValues("Retry-After").Single());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("requestId").GetString()));
    }

    [Fact]
    public async Task Unexpected_exceptions_do_not_leak_details()
    {
        using var factory = new ApiFactory();
        factory.Diagnostics.Respond = (_, _) => throw new InvalidOperationException("connection string password=hunter2");
        var response = await factory.CreateClient().PostAsync("/api/v1/diagnostics/ping", Json("""{"destination":"8.8.8.8"}"""));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("hunter2", text);
        Assert.Contains("internal_error", text);
    }

    [Fact]
    public async Task Bgp_endpoints_report_unavailable_without_failing_the_api()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        foreach (var path in new[] { "routes", "sessions", "prefix/203.0.113.0", "asn/64512" })
        {
            var response = await client.GetAsync($"/api/v1/bgp/{path}");
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            Assert.Equal("bgp_unavailable", (await Problem(response)).GetProperty("code").GetString());
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/status")).StatusCode);
    }

    [Fact]
    public async Task Health_endpoints_are_ok_even_when_diagnostics_is_down()
    {
        using var factory = new ApiFactory();
        factory.Diagnostics.Ready = null;
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/metrics")).StatusCode);
    }

    [Fact]
    public async Task Management_port_serves_only_metrics_and_the_public_port_never_does()
    {
        using var factory = new ApiFactory();

        async Task<(int Status, string Body)> Send(string path, int localPort)
        {
            var context = await factory.Server.SendAsync(c =>
            {
                c.Request.Method = "GET";
                c.Request.Path = path;
                c.Connection.LocalPort = localPort;
            });
            using var reader = new StreamReader(context.Response.Body);
            return (context.Response.StatusCode, await reader.ReadToEndAsync());
        }

        var (metricsStatus, metricsBody) = await Send("/metrics", 9090);
        Assert.Equal(200, metricsStatus);
        Assert.Contains("looking_glass_requests_total", metricsBody);
        Assert.Contains("looking_glass_diagnostics_active", metricsBody);

        Assert.Equal(404, (await Send("/api/v1/status", 9090)).Status);
        Assert.Equal(404, (await Send("/api/v1/network", 9090)).Status);
        Assert.Equal(404, (await Send("/health/live", 9090)).Status);
        Assert.Equal(404, (await Send("/metrics", 8080)).Status);
        Assert.Equal(200, (await Send("/api/v1/activity", 8080)).Status);
    }

    [Fact]
    public async Task Activity_records_only_successful_diagnostics_without_visitor_identity()
    {
        using var factory = new ApiFactory();
        var client = factory.CreateClient();

        await client.PostAsync("/api/v1/diagnostics/ping", Json("""{"destination":"8.8.8.8"}"""));
        await client.PostAsync("/api/v1/diagnostics/ping", Json("""{"destination":"10.0.0.1"}"""));
        await client.PostAsync("/api/v1/diagnostics/dns", Json("""{"name":"example.com","recordType":"A"}"""));

        var activity = await client.GetFromJsonAsync<ActivityResponse>("/api/v1/activity", LookingGlassJson.Options);
        Assert.True(activity!.Enabled);
        Assert.Equal(2, activity.Items.Count);
        Assert.Equal(["dns", "ping"], activity.Items.Select(i => i.Type));
        Assert.Equal("12.4 ms avg, 0% loss", activity.Items[1].Summary);
        Assert.DoesNotContain(activity.Items, i => i.Target.Contains("10.0.0.1"));
    }

    [Fact]
    public async Task Activity_can_be_disabled()
    {
        using var factory = new ApiFactory().WithSettings(("Activity:Enabled", "false"));
        var client = factory.CreateClient();
        await client.PostAsync("/api/v1/diagnostics/ping", Json("""{"destination":"8.8.8.8"}"""));

        var activity = await client.GetFromJsonAsync<ActivityResponse>("/api/v1/activity", LookingGlassJson.Options);
        Assert.False(activity!.Enabled);
        Assert.Empty(activity.Items);
    }

    [Fact]
    public async Task Network_uses_configuration_then_discovered_addresses()
    {
        using var factory = new ApiFactory().WithSettings(
            ("LookingGlass:Location", "Chicago, IL"),
            ("LookingGlass:Asn", "64512"),
            ("LookingGlass:Ipv4", "203.0.113.10"),
            ("LookingGlass:Ipv6", "not-an-ip"));
        var info = await factory.CreateClient().GetFromJsonAsync<NetworkInfoResponse>("/api/v1/network", LookingGlassJson.Options);

        Assert.Equal("Chicago, IL", info!.Location);
        Assert.Equal("AS64512", info.Asn);
        Assert.Equal("203.0.113.10", info.Ipv4);
        Assert.Equal("2001:db8::7", info.Ipv6);
        Assert.Equal("Kubernetes", info.Platform);
    }

    [Fact]
    public async Task Network_survives_diagnostics_being_unreachable()
    {
        using var factory = new ApiFactory();
        factory.Diagnostics.Egress = () => throw LookingGlassException.Unavailable("down");
        var response = await factory.CreateClient().GetAsync("/api/v1/network");
        response.EnsureSuccessStatusCode();
        var info = await response.Content.ReadFromJsonAsync<NetworkInfoResponse>(LookingGlassJson.Options);
        Assert.Null(info!.Ipv4);
    }

    [Fact]
    public async Task Performance_is_proxied_and_fails_cleanly()
    {
        using var factory = new ApiFactory();
        var ok = await factory.CreateClient().GetFromJsonAsync<PerformanceResponse>("/api/v1/network/performance", LookingGlassJson.Options);
        Assert.Equal(11, ok!.AvgLatencyMs);

        using var down = new ApiFactory();
        down.Diagnostics.Performance = () => throw LookingGlassException.Unavailable("down");
        var response = await down.CreateClient().GetAsync("/api/v1/network/performance");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("service_unavailable", (await Problem(response)).GetProperty("code").GetString());
    }
}
