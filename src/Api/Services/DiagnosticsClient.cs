using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;

namespace GeiseIT.LookingGlass.Api.Services;

public interface IDiagnosticsClient
{
    Task<TResponse> PostAsync<TResponse>(string operation, object? body, string requestId, CancellationToken cancellationToken);

    Task<PerformanceResponse> GetPerformanceAsync(CancellationToken cancellationToken);

    Task<EgressAddresses> GetEgressAsync(CancellationToken cancellationToken);

    Task<double?> CheckReadyAsync(CancellationToken cancellationToken);
}

public sealed class DiagnosticsClient(HttpClient http) : IDiagnosticsClient
{
    public Task<TResponse> PostAsync<TResponse>(string operation, object? body, string requestId, CancellationToken cancellationToken) =>
        SendAsync<TResponse>(
            () => new HttpRequestMessage(HttpMethod.Post, $"internal/v1/{operation}")
            {
                Content = JsonContent.Create(body, options: LookingGlassJson.Options),
            },
            requestId,
            cancellationToken);

    public Task<PerformanceResponse> GetPerformanceAsync(CancellationToken cancellationToken) =>
        SendAsync<PerformanceResponse>(() => new HttpRequestMessage(HttpMethod.Get, "internal/v1/connectivity"), null, cancellationToken);

    public Task<EgressAddresses> GetEgressAsync(CancellationToken cancellationToken) =>
        SendAsync<EgressAddresses>(() => new HttpRequestMessage(HttpMethod.Get, "internal/v1/egress"), null, cancellationToken);

    public async Task<double?> CheckReadyAsync(CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(2));
        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var response = await http.GetAsync("health/ready", timeout.Token);
            return response.IsSuccessStatusCode ? stopwatch.Elapsed.TotalMilliseconds : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            return null;
        }
    }

    private async Task<T> SendAsync<T>(Func<HttpRequestMessage> create, string? requestId, CancellationToken cancellationToken)
    {
        using var request = create();
        if (requestId is not null)
        {
            request.Headers.TryAddWithoutValidation(RequestIdMiddleware.HeaderName, requestId);
        }

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            throw LookingGlassException.Unavailable("The diagnostics service is not reachable right now.", ex);
        }

        using (response)
        {
            if (response.IsSuccessStatusCode)
            {
                try
                {
                    var result = await response.Content.ReadFromJsonAsync<T>(LookingGlassJson.Options, cancellationToken);
                    return result ?? throw LookingGlassException.Failed("The diagnostics service returned an empty response.");
                }
                catch (JsonException ex)
                {
                    throw LookingGlassException.Failed("The diagnostics service returned an unreadable response.", ex);
                }
            }

            throw await ReadProblemAsync(response, cancellationToken);
        }
    }

    private static async Task<LookingGlassException> ReadProblemAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var root = document.RootElement;
            var code = root.TryGetProperty("code", out var c) ? c.GetString() : null;
            var detail = root.TryGetProperty("detail", out var d) ? d.GetString() : null;
            int? retry = root.TryGetProperty("retryAfterSeconds", out var r) && r.TryGetInt32(out var seconds) ? seconds : null;
            if (code is not null && detail is not null)
            {
                return new LookingGlassException(code, (int)response.StatusCode, detail, retry);
            }
        }
        catch (JsonException)
        {
        }

        return LookingGlassException.Unavailable("The diagnostics service returned an unexpected error.");
    }
}
