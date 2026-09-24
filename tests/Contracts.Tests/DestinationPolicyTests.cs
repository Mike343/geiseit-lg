using System.Net;
using GeiseIT.LookingGlass.Contracts.Networking;

namespace GeiseIT.LookingGlass.Contracts.Tests;

public class DestinationPolicyTests
{
    private readonly DestinationPolicy _policy = DestinationPolicy.Default;

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("1.1.1.1")]
    [InlineData("2606:4700:4700::1111")]
    [InlineData("example.com")]
    [InlineData("Dns.Google")]
    [InlineData("sub.domain.example.org.")]
    [InlineData("xn--bcher-kva.example.com")]
    public void Accepts_public_destinations(string input)
    {
        var result = _policy.Parse(input);
        Assert.True(result.Success, result.Error?.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("8.8.8.8; rm -rf /")]
    [InlineData("8.8.8.8 -c 1000")]
    [InlineData("$(whoami).example.com")]
    [InlineData("`id`.example.com")]
    [InlineData("example.com|cat")]
    [InlineData("example.com&&ls")]
    [InlineData("-c1.example.com")]
    [InlineData("--help")]
    [InlineData("-f")]
    [InlineData("http://example.com")]
    [InlineData("https://example.com/path")]
    [InlineData("example.com/path")]
    [InlineData("user@example.com")]
    [InlineData("example.com:443")]
    [InlineData("[2606:4700:4700::1111]")]
    [InlineData("fe80::1%eth0")]
    [InlineData("1.2.3")]
    [InlineData("1.2.3.4.5")]
    [InlineData("256.1.1.1")]
    [InlineData("01.2.3.4")]
    [InlineData("127.1")]
    [InlineData("2130706433")]
    [InlineData("0x7f.0.0.1")]
    [InlineData("exa mple.com")]
    [InlineData("example..com")]
    [InlineData(".example.com")]
    [InlineData("-example.com")]
    [InlineData("example-.com")]
    [InlineData("exa_mple.com")]
    [InlineData("bücher.example.com")]
    [InlineData("example.com\nid")]
    [InlineData("example.123")]
    public void Rejects_malformed_or_injected_input(string? input)
    {
        var result = _policy.Parse(input);
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("127.255.255.254")]
    [InlineData("0.0.0.0")]
    [InlineData("10.0.0.1")]
    [InlineData("10.96.0.1")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.1.1")]
    [InlineData("169.254.169.254")]
    [InlineData("169.254.170.2")]
    [InlineData("100.64.0.1")]
    [InlineData("100.100.100.200")]
    [InlineData("224.0.0.1")]
    [InlineData("239.255.255.250")]
    [InlineData("255.255.255.255")]
    [InlineData("240.0.0.1")]
    [InlineData("192.0.2.1")]
    [InlineData("198.51.100.1")]
    [InlineData("203.0.113.1")]
    [InlineData("198.18.0.1")]
    [InlineData("::1")]
    [InlineData("::")]
    [InlineData("fc00::1")]
    [InlineData("fd00:ec2::254")]
    [InlineData("fe80::1")]
    [InlineData("fec0::1")]
    [InlineData("ff02::1")]
    [InlineData("2001:db8::1")]
    [InlineData("2001::1")]
    [InlineData("::ffff:127.0.0.1")]
    [InlineData("::ffff:10.0.0.1")]
    [InlineData("::ffff:169.254.169.254")]
    [InlineData("::127.0.0.1")]
    [InlineData("64:ff9b::7f00:1")]
    [InlineData("64:ff9b::a00:1")]
    [InlineData("2002:7f00:1::1")]
    [InlineData("2002:a00:1::1")]
    public void Blocks_non_public_addresses(string input)
    {
        var result = _policy.Parse(input);
        Assert.False(result.Success);
        Assert.Equal(DestinationErrorKind.Blocked, result.Error!.Kind);
    }

    [Theory]
    [InlineData("localhost")]
    [InlineData("foo.localhost")]
    [InlineData("printer.local")]
    [InlineData("db.internal")]
    [InlineData("kubernetes.default.svc")]
    [InlineData("api.default.svc.cluster.local")]
    [InlineData("router.lan")]
    [InlineData("nas.home.arpa")]
    [InlineData("gateway")]
    [InlineData("1.0.0.127.in-addr.arpa")]
    [InlineData("metadata.google.internal")]
    [InlineData("hidden.onion")]
    public void Blocks_internal_names(string input)
    {
        var result = _policy.Parse(input);
        Assert.False(result.Success);
        Assert.Equal(DestinationErrorKind.Blocked, result.Error!.Kind);
    }

    [Fact]
    public void Normalises_hostnames_to_lowercase_without_trailing_dot()
    {
        var result = _policy.Parse("  Example.COM. ");
        Assert.True(result.Success);
        Assert.Equal("example.com", result.Destination!.Text);
        Assert.Equal(DestinationKind.Hostname, result.Destination.Kind);
    }

    [Fact]
    public void Parses_ip_literals_to_addresses()
    {
        var result = _policy.Parse("2606:4700:4700::1111");
        Assert.Equal(DestinationKind.IpAddress, result.Destination!.Kind);
        Assert.Equal(IPAddress.Parse("2606:4700:4700::1111"), result.Destination.Address);
    }

    [Fact]
    public void Rejects_overlong_input()
    {
        Assert.False(_policy.Parse(new string('a', 300) + ".com").Success);
        Assert.False(_policy.Parse(string.Join('.', Enumerable.Repeat(new string('a', 60), 5)) + ".com").Success);
        Assert.False(_policy.Parse(new string('a', 64) + ".com").Success);
    }

    [Fact]
    public void Allows_underscore_labels_only_when_requested()
    {
        Assert.False(_policy.Parse("_dmarc.example.com").Success);
        Assert.True(_policy.Parse("_dmarc.example.com", allowUnderscore: true).Success);
    }

    [Fact]
    public void Honours_extra_blocked_suffixes_and_cidrs()
    {
        var policy = new DestinationPolicy(new IpBlocklist(["203.0.114.0/24", "2a00:1450::/32"]), ["corp.geiseit.com"]);
        Assert.False(policy.Parse("203.0.114.9").Success);
        Assert.False(policy.Parse("2a00:1450::1").Success);
        Assert.False(policy.Parse("wiki.corp.geiseit.com").Success);
        Assert.True(policy.Parse("www.geiseit.com").Success);
        Assert.True(policy.Parse("203.0.115.9").Success);
    }
}

public class IpBlocklistTests
{
    [Theory]
    [InlineData("8.8.8.8", false)]
    [InlineData("1.1.1.1", false)]
    [InlineData("172.15.255.255", false)]
    [InlineData("172.32.0.1", false)]
    [InlineData("100.63.255.255", false)]
    [InlineData("100.128.0.1", false)]
    [InlineData("2606:4700:4700::1111", false)]
    [InlineData("2001:4860:4860::8888", false)]
    [InlineData("::ffff:8.8.8.8", false)]
    [InlineData("2002:808:808::1", true)]
    [InlineData("64:ff9b::808:808", false)]
    [InlineData("172.16.0.0", true)]
    [InlineData("172.31.255.255", true)]
    [InlineData("::ffff:192.168.0.1", true)]
    public void Classifies_addresses(string address, bool blocked)
    {
        Assert.Equal(blocked, IpBlocklist.Default.IsBlocked(IPAddress.Parse(address)));
    }
}
