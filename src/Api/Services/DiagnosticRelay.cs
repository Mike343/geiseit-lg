using System.Diagnostics;
using System.Globalization;
using GeiseIT.LookingGlass.Api.Metrics;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;

namespace GeiseIT.LookingGlass.Api.Services;

public sealed class DiagnosticRelay(
    IDiagnosticsClient client,
    DestinationPolicy policy,
    ActivityLog activity,
    ClientIpHasher hasher,
    ILogger<DiagnosticRelay> logger)
{
    private const int MaxLoggedInputLength = 100;

    public Task<PingResponse> PingAsync(HttpContext context, DestinationRequest? body) =>
        RelayAsync<PingResponse>(
            context,
            DiagnosticTypes.Ping,
            body,
            body?.Destination,
            () => ValidateDestination(body),
            r => (r.Destination, r.Received == 0
                ? "No reply"
                : string.Create(CultureInfo.InvariantCulture, $"{r.AvgMs:0.#} ms avg, {r.LossPercent:0.#}% loss")));

    public Task<TracerouteResponse> TracerouteAsync(HttpContext context, DestinationRequest? body) =>
        RelayAsync<TracerouteResponse>(
            context,
            DiagnosticTypes.Traceroute,
            body,
            body?.Destination,
            () => ValidateDestination(body),
            r => (r.Destination, string.Create(CultureInfo.InvariantCulture, $"{r.Hops.Count} hops")));

    public Task<MtrResponse> MtrAsync(HttpContext context, DestinationRequest? body) =>
        RelayAsync<MtrResponse>(
            context,
            DiagnosticTypes.Mtr,
            body,
            body?.Destination,
            () => ValidateDestination(body),
            r => (r.Destination, string.Create(CultureInfo.InvariantCulture, $"{r.Hops.Count} hops")));

    public Task<DnsResponse> DnsAsync(HttpContext context, DnsLookupRequest? body) =>
        RelayAsync<DnsResponse>(
            context,
            DiagnosticTypes.Dns,
            body,
            body?.Name,
            () => ValidateDns(body),
            r => (r.Name, string.Create(CultureInfo.InvariantCulture, $"{r.RecordType} · {r.Records.Count} records")));

    private async Task<TResponse> RelayAsync<TResponse>(
        HttpContext context,
        string type,
        object? body,
        string? rawInput,
        Action validate,
        Func<TResponse, (string Target, string Summary)> describe)
    {
        var stopwatch = Stopwatch.StartNew();
        ApiMetrics.Requests.WithLabels(type).Inc();
        ApiMetrics.Active.Inc();
        var clientHash = hasher.Hash(context.Connection.RemoteIpAddress?.ToString());
        var input = Truncate(rawInput);

        try
        {
            validate();
            var response = await client.PostAsync<TResponse>(type, body, context.TraceIdentifier, context.RequestAborted);
            var (target, summary) = describe(response);
            activity.Add(type, target, summary);
            logger.LogInformation(
                "diagnostic {result} request_id={request_id} client_ip_hash={client_ip_hash} endpoint={endpoint} diagnostic_type={diagnostic_type} destination={destination} duration_ms={duration_ms}",
                "ok",
                context.TraceIdentifier,
                clientHash,
                context.Request.Path.Value,
                type,
                input,
                stopwatch.ElapsedMilliseconds);
            return response;
        }
        catch (LookingGlassException ex)
        {
            ApiMetrics.RequestsFailed.WithLabels(type, ex.Code).Inc();
            if (ex.Code is ProblemCodes.ValidationFailed or ProblemCodes.DestinationBlocked or ProblemCodes.Busy)
            {
                ApiMetrics.Rejected.WithLabels(ex.Code).Inc();
            }

            logger.LogWarning(
                "diagnostic {result} request_id={request_id} client_ip_hash={client_ip_hash} endpoint={endpoint} diagnostic_type={diagnostic_type} destination={destination} duration_ms={duration_ms} error={error}",
                "failed",
                context.TraceIdentifier,
                clientHash,
                context.Request.Path.Value,
                type,
                input,
                stopwatch.ElapsedMilliseconds,
                ex.Code);
            throw;
        }
        catch (OperationCanceledException)
        {
            ApiMetrics.RequestsFailed.WithLabels(type, ProblemCodes.Cancelled).Inc();
            logger.LogInformation(
                "diagnostic {result} request_id={request_id} client_ip_hash={client_ip_hash} endpoint={endpoint} diagnostic_type={diagnostic_type} destination={destination} duration_ms={duration_ms}",
                "cancelled",
                context.TraceIdentifier,
                clientHash,
                context.Request.Path.Value,
                type,
                input,
                stopwatch.ElapsedMilliseconds);
            throw;
        }
        finally
        {
            ApiMetrics.Active.Dec();
            ApiMetrics.RequestDuration.WithLabels(type).Observe(stopwatch.Elapsed.TotalSeconds);
        }
    }

    private void ValidateDestination(DestinationRequest? body)
    {
        if (body is null)
        {
            throw LookingGlassException.Validation("A destination is required.");
        }

        ThrowIfInvalid(policy.Parse(body.Destination));
    }

    private void ValidateDns(DnsLookupRequest? body)
    {
        if (body is null)
        {
            throw LookingGlassException.Validation("A domain name is required.");
        }

        if (!DnsRecordTypes.TryNormalize(body.RecordType, out _))
        {
            throw LookingGlassException.Validation($"Record type must be one of {string.Join(", ", DnsRecordTypes.Supported)}.");
        }

        ThrowIfInvalid(policy.Parse(body.Name, allowUnderscore: true));
    }

    private static void ThrowIfInvalid(DestinationParseResult result)
    {
        if (result.Error is { } error)
        {
            throw error.Kind == DestinationErrorKind.Blocked
                ? LookingGlassException.Blocked(error.Message)
                : LookingGlassException.Validation(error.Message);
        }
    }

    private static string Truncate(string? input) =>
        input is null ? string.Empty : input.Length <= MaxLoggedInputLength ? input : input[..MaxLoggedInputLength];
}
