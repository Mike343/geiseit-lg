using System.Net;
using System.Net.Sockets;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics.Dns;

namespace GeiseIT.LookingGlass.Diagnostics.Security;

public sealed record ResolvedTarget(string Destination, IPAddress Address, IpVersion Family);

public sealed class TargetResolver(DestinationPolicy policy, IHostResolver resolver)
{
    public async Task<ResolvedTarget> ResolveAsync(string? input, IpFamily family, CancellationToken cancellationToken)
    {
        var parsed = policy.Parse(input);
        if (parsed.Error is { } error)
        {
            throw error.Kind == DestinationErrorKind.Blocked
                ? LookingGlassException.Blocked(error.Message)
                : LookingGlassException.Validation(error.Message);
        }

        var destination = parsed.Destination!;
        if (destination.Kind == DestinationKind.IpAddress)
        {
            var address = destination.Address!;
            if (!Matches(address, family))
            {
                throw LookingGlassException.Validation(
                    $"That is an {VersionOf(address).ToString().ToUpperInvariant()} address, but {family.ToString().ToUpperInvariant()} was requested.");
            }

            return new ResolvedTarget(destination.Text, address, VersionOf(address));
        }

        var addresses = await resolver.ResolveAsync(destination.Text, family, cancellationToken);
        if (addresses.Count == 0)
        {
            throw LookingGlassException.Failed(
                family == IpFamily.Auto
                    ? "The hostname could not be resolved."
                    : $"The hostname has no {family.ToString().ToUpperInvariant()} address.");
        }

        if (addresses.Any(policy.Blocklist.IsBlocked))
        {
            throw LookingGlassException.Blocked("That hostname resolves to a private, reserved or otherwise restricted address and cannot be tested.");
        }

        var chosen = addresses.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork) ?? addresses[0];
        return new ResolvedTarget(destination.Text, chosen, VersionOf(chosen));
    }

    private static bool Matches(IPAddress address, IpFamily family) => family switch
    {
        IpFamily.Ipv4 => address.AddressFamily == AddressFamily.InterNetwork,
        IpFamily.Ipv6 => address.AddressFamily == AddressFamily.InterNetworkV6,
        _ => true,
    };

    private static IpVersion VersionOf(IPAddress address) =>
        address.AddressFamily == AddressFamily.InterNetworkV6 ? IpVersion.Ipv6 : IpVersion.Ipv4;
}
