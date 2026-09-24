namespace GeiseIT.LookingGlass.Contracts;

public sealed class LookingGlassException(
    string code,
    int status,
    string message,
    int? retryAfterSeconds = null,
    Exception? inner = null) : Exception(message, inner)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
    public int? RetryAfterSeconds { get; } = retryAfterSeconds;

    public static LookingGlassException Validation(string message) =>
        new(ProblemCodes.ValidationFailed, 400, message);

    public static LookingGlassException Blocked(string message) =>
        new(ProblemCodes.DestinationBlocked, 422, message);

    public static LookingGlassException Busy(int retryAfterSeconds = 5) =>
        new(ProblemCodes.Busy, 503, "The Looking Glass is handling a lot of diagnostics right now. Please try again in a few seconds.", retryAfterSeconds);

    public static LookingGlassException Timeout() =>
        new(ProblemCodes.Timeout, 504, "The destination did not respond before the timeout.");

    public static LookingGlassException Failed(string message, Exception? inner = null) =>
        new(ProblemCodes.DiagnosticFailed, 502, message, null, inner);

    public static LookingGlassException Unavailable(string message, Exception? inner = null) =>
        new(ProblemCodes.ServiceUnavailable, 503, message, 5, inner);
}
