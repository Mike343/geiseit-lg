using Microsoft.Extensions.Configuration;

namespace GeiseIT.LookingGlass.Contracts.Hosting;

public static class LookingGlassConfiguration
{
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.Ordinal)
    {
        ["LOOKING_GLASS_LOCATION"] = "LookingGlass:Location",
        ["LOOKING_GLASS_HOSTNAME"] = "LookingGlass:Hostname",
        ["LOOKING_GLASS_ASN"] = "LookingGlass:Asn",
        ["LOOKING_GLASS_NETWORK"] = "LookingGlass:Network",
        ["LOOKING_GLASS_IPV4"] = "LookingGlass:Ipv4",
        ["LOOKING_GLASS_IPV6"] = "LookingGlass:Ipv6",
        ["DIAGNOSTICS_TIMEOUT_SECONDS"] = "Diagnostics:TimeoutSeconds",
        ["DIAGNOSTICS_MAX_CONCURRENT"] = "Diagnostics:MaxConcurrent",
        ["RATE_LIMIT_PING"] = "RateLimiting:Ping:PermitLimit",
        ["RATE_LIMIT_TRACEROUTE"] = "RateLimiting:Traceroute:PermitLimit",
        ["RATE_LIMIT_MTR"] = "RateLimiting:Mtr:PermitLimit",
        ["RATE_LIMIT_DNS"] = "RateLimiting:Dns:PermitLimit",
    };

    public static IConfigurationBuilder AddEnvironmentAliases(this IConfigurationBuilder builder)
    {
        var values = new Dictionary<string, string?>();
        foreach (var (variable, key) in Aliases)
        {
            var value = Environment.GetEnvironmentVariable(variable);
            if (!string.IsNullOrWhiteSpace(value))
            {
                values[key] = value;
            }
        }

        builder.AddInMemoryCollection(values);
        return builder.AddEnvironmentVariables();
    }

    public static string[] SplitList(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? []
            : csv.Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
