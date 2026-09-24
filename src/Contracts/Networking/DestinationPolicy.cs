using System.Globalization;
using System.Net;
using System.Net.Sockets;

namespace GeiseIT.LookingGlass.Contracts.Networking;

public enum DestinationKind
{
    IpAddress,
    Hostname,
}

public enum DestinationErrorKind
{
    Invalid,
    Blocked,
}

public sealed record DestinationError(DestinationErrorKind Kind, string Message);

public sealed record ParsedDestination
{
    public DestinationKind Kind { get; init; }
    public IPAddress? Address { get; init; }
    public string Text { get; init; } = string.Empty;
}

public sealed record DestinationParseResult
{
    public ParsedDestination? Destination { get; init; }
    public DestinationError? Error { get; init; }
    public bool Success => Destination is not null;

    public static DestinationParseResult Ok(ParsedDestination destination) => new() { Destination = destination };

    public static DestinationParseResult Invalid(string message) =>
        new() { Error = new DestinationError(DestinationErrorKind.Invalid, message) };

    public static DestinationParseResult Blocked(string message) =>
        new() { Error = new DestinationError(DestinationErrorKind.Blocked, message) };
}

public sealed class DestinationPolicy
{
    public const int MaxInputLength = 255;

    private static readonly string[] DefaultBlockedSuffixes =
    [
        "localhost",
        "local",
        "localdomain",
        "internal",
        "intranet",
        "private",
        "corp",
        "lan",
        "home",
        "home.arpa",
        "svc",
        "cluster.local",
        "in-addr.arpa",
        "ip6.arpa",
        "onion",
        "test",
        "invalid",
        "example",
    ];

    private readonly string[] _blockedSuffixes;

    public DestinationPolicy(IpBlocklist? blocklist = null, IEnumerable<string>? extraBlockedSuffixes = null)
    {
        Blocklist = blocklist ?? IpBlocklist.Default;
        _blockedSuffixes =
        [
            .. DefaultBlockedSuffixes
                .Concat(extraBlockedSuffixes ?? [])
                .Select(s => s.Trim().Trim('.').ToLowerInvariant())
                .Where(s => s.Length > 0),
        ];
    }

    public static DestinationPolicy Default { get; } = new();

    public IpBlocklist Blocklist { get; }

    public bool IsBlockedName(string asciiLowerName)
    {
        foreach (var suffix in _blockedSuffixes)
        {
            if (asciiLowerName == suffix || asciiLowerName.EndsWith("." + suffix, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    public DestinationParseResult Parse(string? input, bool allowUnderscore = false)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return DestinationParseResult.Invalid("Enter a hostname or IP address.");
        }

        var text = input.Trim();
        if (text.Length > MaxInputLength)
        {
            return DestinationParseResult.Invalid("That value is too long to be a hostname or IP address.");
        }

        if (text.Any(c => c < 0x20 || c == 0x7f || char.IsWhiteSpace(c)))
        {
            return DestinationParseResult.Invalid("Spaces and control characters are not allowed.");
        }

        if (text.Contains("://", StringComparison.Ordinal) || text.Contains('/') || text.Contains('\\') ||
            text.Contains('?') || text.Contains('#') || text.Contains('@'))
        {
            return DestinationParseResult.Invalid("Enter only a hostname or IP address, not a URL or path.");
        }

        if (text.Contains(':'))
        {
            return ParseIpv6(text);
        }

        if (text.All(c => c is (>= '0' and <= '9') or '.'))
        {
            return ParseIpv4(text);
        }

        return ParseHostname(text, allowUnderscore);
    }

    private DestinationParseResult ParseIpv4(string text)
    {
        var parts = text.Split('.');
        if (parts.Length != 4)
        {
            return DestinationParseResult.Invalid("That is not a valid IPv4 address.");
        }

        var octets = new byte[4];
        for (var i = 0; i < 4; i++)
        {
            var part = parts[i];
            if (part.Length is 0 or > 3 || (part.Length > 1 && part[0] == '0') ||
                !int.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out var value) || value > 255)
            {
                return DestinationParseResult.Invalid("That is not a valid IPv4 address.");
            }

            octets[i] = (byte)value;
        }

        return CheckAddress(new IPAddress(octets));
    }

    private DestinationParseResult ParseIpv6(string text)
    {
        if (text.Length > 45 || text.Any(c => !(Uri.IsHexDigit(c) || c is ':' or '.')))
        {
            return DestinationParseResult.Invalid("That is not a valid IPv6 address. Ports, brackets and zone IDs are not accepted.");
        }

        if (!IPAddress.TryParse(text, out var address) || address.AddressFamily != AddressFamily.InterNetworkV6 || address.ScopeId != 0)
        {
            return DestinationParseResult.Invalid("That is not a valid IPv6 address.");
        }

        return CheckAddress(address);
    }

    private DestinationParseResult CheckAddress(IPAddress address)
    {
        if (Blocklist.IsBlocked(address))
        {
            return DestinationParseResult.Blocked("That address is in a private, reserved or otherwise restricted range and cannot be tested.");
        }

        return DestinationParseResult.Ok(new ParsedDestination
        {
            Kind = DestinationKind.IpAddress,
            Address = address,
            Text = address.ToString(),
        });
    }

    private DestinationParseResult ParseHostname(string text, bool allowUnderscore)
    {
        if (text.Any(c => c > 0x7e))
        {
            return DestinationParseResult.Invalid("Internationalised names must be entered in their ASCII (xn--) form.");
        }

        var name = text.TrimEnd('.').ToLowerInvariant();
        if (name.Length is 0 or > 253)
        {
            return DestinationParseResult.Invalid("That is not a valid hostname.");
        }

        var labels = name.Split('.');
        foreach (var label in labels)
        {
            if (!IsValidLabel(label, allowUnderscore))
            {
                return DestinationParseResult.Invalid("That is not a valid hostname.");
            }
        }

        if (labels.Length < 2)
        {
            return DestinationParseResult.Blocked("Single-label names are treated as internal hostnames and cannot be tested.");
        }

        var tld = labels[^1];
        if (tld.All(char.IsAsciiDigit) || tld.Contains('_'))
        {
            return DestinationParseResult.Invalid("That is not a valid hostname.");
        }

        if (IsBlockedName(name))
        {
            return DestinationParseResult.Blocked("Internal and reserved names cannot be tested.");
        }

        return DestinationParseResult.Ok(new ParsedDestination { Kind = DestinationKind.Hostname, Text = name });
    }

    private static bool IsValidLabel(string label, bool allowUnderscore)
    {
        if (label.Length is 0 or > 63)
        {
            return false;
        }

        if (label[0] == '-' || label[^1] == '-')
        {
            return false;
        }

        foreach (var c in label)
        {
            if (!(char.IsAsciiLetterOrDigit(c) || c == '-' || (allowUnderscore && c == '_')))
            {
                return false;
            }
        }

        return true;
    }
}
