using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;

namespace GeiseIT.LookingGlass.Contracts.Hosting;

public sealed partial class RequestIdMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Request-Id";

    [GeneratedRegex("^[A-Za-z0-9-]{8,64}$")]
    private static partial Regex ValidId();

    public Task InvokeAsync(HttpContext context)
    {
        var incoming = context.Request.Headers[HeaderName].ToString();
        var id = ValidId().IsMatch(incoming)
            ? incoming
            : Activity.Current?.TraceId.ToString() ?? Guid.NewGuid().ToString("N");

        context.TraceIdentifier = id;
        context.Response.Headers[HeaderName] = id;
        return next(context);
    }
}
