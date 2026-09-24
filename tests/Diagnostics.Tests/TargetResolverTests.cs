using System.Net;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics.Security;

namespace GeiseIT.LookingGlass.Diagnostics.Tests;

public class TargetResolverTests
{
    private readonly FakeHostResolver _dns = new();
    private readonly TargetResolver _resolver;

    public TargetResolverTests()
    {
        _resolver = new TargetResolver(DestinationPolicy.Default, _dns);
        _dns.Hosts["example.org"] = [IPAddress.Parse("93.184.216.34"), IPAddress.Parse("2606:2800:220:1::1")];
        _dns.Hosts["v6only.example.org"] = [IPAddress.Parse("2606:2800:220:1::1")];
        _dns.Hosts["evil.example.org"] = [IPAddress.Parse("10.1.2.3")];
        _dns.Hosts["rebind.example.org"] = [IPAddress.Parse("93.184.216.34"), IPAddress.Parse("169.254.169.254")];
        _dns.Hosts["mapped.example.org"] = [IPAddress.Parse("::ffff:127.0.0.1")];
        _dns.Hosts["loop6.example.org"] = [IPAddress.Parse("::1")];
    }

    [Fact]
    public async Task Ip_literal_does_not_hit_dns()
    {
        var target = await _resolver.ResolveAsync("8.8.8.8", IpFamily.Auto, CancellationToken.None);
        Assert.Equal(IPAddress.Parse("8.8.8.8"), target.Address);
        Assert.Equal(IpVersion.Ipv4, target.Family);
        Assert.Equal(0, _dns.ResolveCalls);
    }

    [Fact]
    public async Task Auto_prefers_ipv4_and_family_selects_the_record()
    {
        Assert.Equal(IpVersion.Ipv4, (await _resolver.ResolveAsync("example.org", IpFamily.Auto, default)).Family);
        Assert.Equal(IpVersion.Ipv6, (await _resolver.ResolveAsync("example.org", IpFamily.Ipv6, default)).Family);
        Assert.Equal(IpVersion.Ipv6, (await _resolver.ResolveAsync("v6only.example.org", IpFamily.Auto, default)).Family);
    }

    [Theory]
    [InlineData("evil.example.org")]
    [InlineData("rebind.example.org")]
    [InlineData("mapped.example.org")]
    [InlineData("loop6.example.org")]
    public async Task Hostnames_resolving_to_restricted_addresses_are_blocked(string host)
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => _resolver.ResolveAsync(host, IpFamily.Auto, default));
        Assert.Equal(ProblemCodes.DestinationBlocked, ex.Code);
        Assert.Equal(422, ex.Status);
    }

    [Fact]
    public async Task Unresolvable_hostname_is_a_diagnostic_failure()
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => _resolver.ResolveAsync("nope.example.org", IpFamily.Auto, default));
        Assert.Equal(ProblemCodes.DiagnosticFailed, ex.Code);
    }

    [Fact]
    public async Task Family_mismatch_for_literals_is_rejected()
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => _resolver.ResolveAsync("8.8.8.8", IpFamily.Ipv6, default));
        Assert.Equal(ProblemCodes.ValidationFailed, ex.Code);
    }

    [Theory]
    [InlineData("10.0.0.1", ProblemCodes.DestinationBlocked)]
    [InlineData("localhost", ProblemCodes.DestinationBlocked)]
    [InlineData("kubernetes.default.svc.cluster.local", ProblemCodes.DestinationBlocked)]
    [InlineData("8.8.8.8; cat /etc/passwd", ProblemCodes.ValidationFailed)]
    [InlineData("$(id)", ProblemCodes.ValidationFailed)]
    [InlineData("--version", ProblemCodes.ValidationFailed)]
    [InlineData("gateway", ProblemCodes.DestinationBlocked)]
    [InlineData("", ProblemCodes.ValidationFailed)]
    [InlineData(null, ProblemCodes.ValidationFailed)]
    public async Task Rejects_bad_input_before_any_lookup(string? input, string code)
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => _resolver.ResolveAsync(input, IpFamily.Auto, default));
        Assert.Equal(code, ex.Code);
        Assert.Equal(0, _dns.ResolveCalls);
    }
}
