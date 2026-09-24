using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace GeiseIT.LookingGlass.Contracts.Hosting;

public static class ProblemResults
{
    public static IResult Create(
        HttpContext context,
        int status,
        string code,
        string title,
        string detail,
        int? retryAfterSeconds = null,
        IDictionary<string, string[]>? errors = null)
    {
        var problem = new ProblemDetails
        {
            Type = $"https://lg.geiseit.com/problems/{code}",
            Title = title,
            Status = status,
            Detail = detail,
        };
        problem.Extensions["code"] = code;
        problem.Extensions["requestId"] = context.TraceIdentifier;
        if (retryAfterSeconds is { } retry)
        {
            problem.Extensions["retryAfterSeconds"] = retry;
            context.Response.Headers.RetryAfter = retry.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        if (errors is { Count: > 0 })
        {
            problem.Extensions["errors"] = errors;
        }

        return Results.Json(problem, LookingGlassJson.Options, "application/problem+json", status);
    }

    public static Task WriteAsync(
        HttpContext context,
        int status,
        string code,
        string title,
        string detail,
        int? retryAfterSeconds = null)
    {
        var result = Create(context, status, code, title, detail, retryAfterSeconds);
        return result.ExecuteAsync(context);
    }
}
