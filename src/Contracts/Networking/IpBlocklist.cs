using System.Net;
using System.Net.Sockets;

namespace GeiseIT.LookingGlass.Contracts.Networking;

public sealed class IpBlocklist
{
    private static readonly string[] DefaultCidrs =
    [
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "::/96",
        "::1/128",
        "64:ff9b:1::/48",
        "100::/64",
        "2001::/23",
        "2001:db8::/32",
        "2002::/16",
        "3fff::/20",
        "fc00::/7",
        "fe80::/10",
        "fec0::/10",
        "ff00::/8",
    ];

    private static readonly IPAddress[] MetadataAddresses =
    [
        IPAddress.Parse("169.254.169.254"),
        IPAddress.Parse("169.254.170.2"),
        IPAddress.Parse("100.100.100.200"),
        IPAddress.Parse("fd00:ec2::254"),
    ];

    private readonly IPNetwork[] _networks;

    public IpBlocklist(IEnumerable<string>? extraCidrs = null)
    {
        var networks = new List<IPNetwork>();
        foreach (var cidr in DefaultCidrs.Concat(extraCidrs ?? []))
        {
            networks.Add(IPNetwork.Parse(cidr));
        }

        _networks = [.. networks];
    }

    public static IpBlocklist Default { get; } = new();

    public bool IsBlocked(IPAddress address)
    {
        ArgumentNullException.ThrowIfNull(address);

        foreach (var candidate in Expand(address))
        {
            if (MetadataAddresses.Contains(candidate))
            {
                return true;
            }

            foreach (var network in _networks)
            {
                if (network.Contains(candidate))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static IEnumerable<IPAddress> Expand(IPAddress address)
    {
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (address.IsIPv4MappedToIPv6)
            {
                yield return address.MapToIPv4();
                yield break;
            }

            yield return address;

            Span<byte> bytes = stackalloc byte[16];
            address.TryWriteBytes(bytes, out _);

            if (IsNat64WellKnown(bytes))
            {
                yield return new IPAddress(bytes.Slice(12, 4));
            }
            else if (bytes[0] == 0x20 && bytes[1] == 0x02)
            {
                yield return new IPAddress(bytes.Slice(2, 4));
            }

            yield break;
        }

        yield return address;
    }

    private static bool IsNat64WellKnown(ReadOnlySpan<byte> bytes)
    {
        if (bytes[0] != 0x00 || bytes[1] != 0x64 || bytes[2] != 0xff || bytes[3] != 0x9b)
        {
            return false;
        }

        for (var i = 4; i < 12; i++)
        {
            if (bytes[i] != 0)
            {
                return false;
            }
        }

        return true;
    }
}
