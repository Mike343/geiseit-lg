using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GeiseIT.LookingGlass.Contracts.Hosting;

public static class ProblemExceptionHandler
{
    public static IApplicationBuilder UseLookingGlassProblems(this IApplicationBuilder app)
    {
        app.UseExceptionHandler(builder => builder.Run(HandleAsync));
        app.UseStatusCodePages(context =>
        {
            var http = context.HttpContext;
            var status = http.Response.StatusCode;
            var (code, detail) = status switch
            {
                400 => (ProblemCodes.ValidationFailed, "The request body is missing or is not valid JSON."),
                404 => (ProblemCodes.ValidationFailed, "The requested resource was not found."),
                405 => (ProblemCodes.ValidationFailed, "That method is not allowed for this resource."),
                413 => (ProblemCodes.PayloadTooLarge, "The request body is too large."),
                415 => (ProblemCodes.UnsupportedMediaType, "Send the request as application/json."),
                _ => (ProblemCodes.Internal, "The request could not be completed."),
            };
            return ProblemResults.WriteAsync(http, status, code, Title(code), detail);
        });
        return app;
    }

    public static string Title(string code) => code switch
    {
        ProblemCodes.ValidationFailed => "Invalid request",
        ProblemCodes.DestinationBlocked => "Destination not allowed",
        ProblemCodes.RateLimited => "Too many requests",
        ProblemCodes.Busy => "Service busy",
        ProblemCodes.Timeout => "Diagnostic timed out",
        ProblemCodes.DiagnosticFailed => "Diagnostic failed",
        ProblemCodes.ServiceUnavailable => "Service unavailable",
        ProblemCodes.BgpUnavailable => "BGP unavailable",
        ProblemCodes.PayloadTooLarge => "Request too large",
        ProblemCodes.UnsupportedMediaType => "Unsupported media type",
        _ => "Unexpected error",
    };

    private static async Task HandleAsync(HttpContext context)
    {
        var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("LookingGlass.Problems");

        switch (error)
        {
            case LookingGlassException lg:
                await ProblemResults.WriteAsync(context, lg.Status, lg.Code, Title(lg.Code), lg.Message, lg.RetryAfterSeconds);
                break;

            case BadHttpRequestException bad:
                var (status, code, detail) = bad.StatusCode switch
                {
                    413 => (413, ProblemCodes.PayloadTooLarge, "The request body is too large."),
                    415 => (415, ProblemCodes.UnsupportedMediaType, "Send the request as application/json."),
                    _ => (400, ProblemCodes.ValidationFailed, "The request body is missing or is not valid JSON."),
                };
                await ProblemResults.WriteAsync(context, status, code, Title(code), detail);
                break;

            case OperationCanceledException when context.RequestAborted.IsCancellationRequested:
                context.Response.StatusCode = 499;
                break;

            default:
                logger.LogError(error, "Unhandled exception for request {RequestId}", context.TraceIdentifier);
                await ProblemResults.WriteAsync(
                    context,
                    500,
                    ProblemCodes.Internal,
                    Title(ProblemCodes.Internal),
                    "Something went wrong on our side. Quote the request ID if you contact us.");
                break;
        }
    }
}
