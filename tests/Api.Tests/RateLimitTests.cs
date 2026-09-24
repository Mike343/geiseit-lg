using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace GeiseIT.LookingGlass.Api.Tests;

public class RateLimitTests
{
    private static StringContent Body(string destination = "8.8.8.8") =>
        new($$"""{"destination":"{{destination}}"}""", Encoding.UTF8, "application/json");

    [Fact]
    public async Task Requests_beyond_the_configured_limit_get_429_with_retry_after()
    {
        using var factory = new ApiFactory().WithSettings(("RateLimiting:Ping:PermitLimit", "3"));
        var client = factory.CreateClient();

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/diagnostics/ping", Body())).StatusCode);
        }

        var limited = await client.PostAsync("/api/v1/diagnostics/ping", Body());
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.Contains("Retry-After"));
        var problem = await limited.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("rate_limited", problem.GetProperty("code").GetString());
        Assert.Contains("3 ping requests per minute", problem.GetProperty("detail").GetString());
        Assert.True(problem.GetProperty("retryAfterSeconds").GetInt32() > 0);
        Assert.Equal(3, factory.Diagnostics.Calls.Count);
    }

    [Fact]
    public async Task Each_endpoint_has_its_own_budget()
    {
        using var factory = new ApiFactory().WithSettings(
            ("RateLimiting:Ping:PermitLimit", "1"),
            ("RateLimiting:Mtr:PermitLimit", "1"));
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/diagnostics/ping", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/api/v1/diagnostics/ping", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/diagnostics/mtr", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/api/v1/diagnostics/mtr", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/diagnostics/traceroute", Body())).StatusCode);
    }

    [Fact]
    public async Task Rejected_and_invalid_requests_still_consume_budget()
    {
        using var factory = new ApiFactory().WithSettings(("RateLimiting:Dns:PermitLimit", "2"));
        var client = factory.CreateClient();

        var bad = new StringContent("""{"name":"db.internal","recordType":"A"}""", Encoding.UTF8, "application/json");
        await client.PostAsync("/api/v1/diagnostics/dns", bad);
        await client.PostAsync("/api/v1/diagnostics/dns", new StringContent("""{"name":"db.internal","recordType":"A"}""", Encoding.UTF8, "application/json"));
        var third = await client.PostAsync("/api/v1/diagnostics/dns", new StringContent("""{"name":"example.com","recordType":"A"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }

    [Fact]
    public async Task Concurrent_diagnostics_per_client_are_capped()
    {
        using var factory = new ApiFactory().WithSettings(("RateLimiting:MaxConcurrentPerIp", "1"));
        var release = new TaskCompletionSource();
        var started = new TaskCompletionSource();
        factory.Diagnostics.Gate = async ct =>
        {
            started.TrySetResult();
            await release.Task.WaitAsync(ct);
        };
        var client = factory.CreateClient();

        var first = client.PostAsync("/api/v1/diagnostics/ping", Body());
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));

        var second = await client.PostAsync("/api/v1/diagnostics/traceroute", Body());
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        var problem = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("rate_limited", problem.GetProperty("code").GetString());
        Assert.Contains("maximum number of diagnostics", problem.GetProperty("detail").GetString());

        release.SetResult();
        Assert.Equal(HttpStatusCode.OK, (await first).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/diagnostics/ping", Body())).StatusCode);
    }

    [Fact]
    public async Task Info_endpoints_are_limited_separately()
    {
        using var factory = new ApiFactory().WithSettings(("RateLimiting:Info:PermitLimit", "2"));
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/activity")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/activity")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.GetAsync("/api/v1/activity")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
    }

    [Fact]
    public async Task Limit_message_reflects_the_configured_value()
    {
        using var factory = new ApiFactory().WithSettings(("RateLimiting:Traceroute:PermitLimit", "1"));
        var client = factory.CreateClient();
        await client.PostAsync("/api/v1/diagnostics/traceroute", Body());
        var limited = await client.PostAsync("/api/v1/diagnostics/traceroute", Body());
        var problem = await limited.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("1 traceroute requests", problem.GetProperty("detail").GetString());
    }
}
