using System.Diagnostics;
using System.Globalization;
using System.Text;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics.Dns;
using GeiseIT.LookingGlass.Diagnostics.Execution;

namespace GeiseIT.LookingGlass.Diagnostics.Services;

public sealed class DnsLookupService(
    IDnsQuery query,
    DestinationPolicy policy,
    DiagnosticsExecutor executor,
    TimeProvider time)
{
    public Task<DnsResponse> LookupAsync(DnsLookupRequest? request, string requestId, CancellationToken cancellationToken) =>
        executor.ExecuteAsync(DiagnosticTypes.Dns, async ct =>
        {
            if (!DnsRecordTypes.TryNormalize(request?.RecordType, out var recordType))
            {
                throw LookingGlassException.Validation(
                    $"Record type must be one of {string.Join(", ", DnsRecordTypes.Supported)}.");
            }

            var started = time.GetUtcNow();
            var queryName = ResolveQueryName(request?.Name, recordType, out var displayName);
            var stopwatch = Stopwatch.StartNew();
            var result = await query.QueryAsync(queryName, recordType, ct);
            stopwatch.Stop();

            if (result.ResponseCode is not ("NoError" or "NotExistentDomain"))
            {
                throw LookingGlassException.Failed("The DNS resolver could not answer this query.");
            }

            var status = result.ResponseCode == "NotExistentDomain"
                ? DnsStatuses.NxDomain
                : result.Answers.Any(a => a.Type == recordType) ? DnsStatuses.Ok : DnsStatuses.NoData;

            return new DnsResponse
            {
                RequestId = requestId,
                Name = displayName,
                RecordType = recordType,
                StartedAt = started,
                DurationMs = (long)stopwatch.Elapsed.TotalMilliseconds,
                Status = status,
                Records = result.Answers,
                TechnicalOutput = Render(queryName, recordType, status, result.Answers, stopwatch.ElapsedMilliseconds),
            };
        }, cancellationToken);

    private string ResolveQueryName(string? input, string recordType, out string displayName)
    {
        var parsed = policy.Parse(input, allowUnderscore: true);
        if (parsed.Error is { } error)
        {
            throw error.Kind == DestinationErrorKind.Blocked
                ? LookingGlassException.Blocked(error.Message)
                : LookingGlassException.Validation(error.Message);
        }

        var destination = parsed.Destination!;
        displayName = destination.Text;

        if (recordType == "PTR")
        {
            if (destination.Kind != DestinationKind.IpAddress)
            {
                throw LookingGlassException.Validation("Enter an IP address for a PTR (reverse) lookup.");
            }

            return HostResolver.ReverseName(destination.Address!);
        }

        if (destination.Kind == DestinationKind.IpAddress)
        {
            throw LookingGlassException.Validation("Enter a domain name for this record type, or choose PTR for an IP address.");
        }

        return destination.Text;
    }

    private static string Render(string name, string recordType, string status, IReadOnlyList<DnsRecord> answers, long elapsedMs)
    {
        var builder = new StringBuilder();
        builder.AppendLine(CultureInfo.InvariantCulture, $";; QUESTION");
        builder.AppendLine(CultureInfo.InvariantCulture, $"{name}. IN {recordType}");
        builder.AppendLine();
        builder.AppendLine(";; ANSWER");
        if (answers.Count == 0)
        {
            builder.AppendLine("(none)");
        }

        foreach (var answer in answers)
        {
            builder.AppendLine(CultureInfo.InvariantCulture, $"{answer.Name}. {answer.Ttl} IN {answer.Type} {answer.Value}");
        }

        builder.AppendLine();
        builder.AppendLine(CultureInfo.InvariantCulture, $";; STATUS: {status.ToUpperInvariant()}  QUERY TIME: {elapsedMs} ms");
        return TextRenderer.Normalise(builder);
    }
}
