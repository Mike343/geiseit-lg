using System.Net;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics.Dns;
using GeiseIT.LookingGlass.Diagnostics.Execution;
using GeiseIT.LookingGlass.Diagnostics.Probes;
using GeiseIT.LookingGlass.Diagnostics.Security;
using GeiseIT.LookingGlass.Diagnostics.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace GeiseIT.LookingGlass.Diagnostics.Tests;

public class DiagnosticsServiceTests
{
    private readonly FakeHostResolver _dns = new();
    private readonly FakeProbeRunner _probes = new();

    private DiagnosticsService Create(Action<DiagnosticsOptions>? configure = null)
    {
        var options = TestOptions.Diagnostics(configure);
        return new DiagnosticsService(
            new TargetResolver(DestinationPolicy.Default, _dns),
            _probes,
            _dns,
            DestinationPolicy.Default,
            new DiagnosticsExecutor(options),
            options,
            TimeProvider.System);
    }

    [Fact]
    public async Task Ping_returns_stats_and_uses_resolved_address()
    {
        _dns.Hosts["dns.google"] = [IPAddress.Parse("8.8.8.8")];
        var result = await Create().PingAsync(new DestinationRequest { Destination = "dns.google" }, "req-12345678", default);

        Assert.Equal("req-12345678", result.RequestId);
        Assert.Equal("dns.google", result.Destination);
        Assert.Equal("8.8.8.8", result.ResolvedAddress);
        Assert.Equal(IPAddress.Parse("8.8.8.8"), Assert.Single(_probes.Targets));
        Assert.Contains("--- dns.google ping statistics ---", result.TechnicalOutput);
        Assert.DoesNotContain('\r', result.TechnicalOutput);
    }

    [Fact]
    public async Task Probe_is_never_invoked_for_blocked_destinations()
    {
        _dns.Hosts["evil.example.org"] = [IPAddress.Parse("192.168.1.1")];
        var service = Create();

        foreach (var input in new[] { "192.168.1.1", "evil.example.org", "127.0.0.1", "::1", "169.254.169.254" })
        {
            await Assert.ThrowsAsync<LookingGlassException>(() =>
                service.PingAsync(new DestinationRequest { Destination = input }, "req-12345678", default));
        }

        Assert.Empty(_probes.Targets);
    }

    [Fact]
    public async Task Null_body_is_a_validation_error()
    {
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => Create().PingAsync(null, "req-12345678", default));
        Assert.Equal(ProblemCodes.ValidationFailed, ex.Code);
    }

    [Fact]
    public async Task Traceroute_redacts_private_hops_and_resolves_public_names()
    {
        _probes.Trace =
        [
            new TraceHopRaw(1, IPAddress.Parse("10.244.0.1"), [0.4, 0.3, 0.4]),
            new TraceHopRaw(2, IPAddress.Parse("100.64.3.4"), [1.0, 1.1, 1.0]),
            new TraceHopRaw(3, null, [null, null, null]),
            new TraceHopRaw(4, IPAddress.Parse("62.115.1.1"), [5.0, null, 5.2]),
            new TraceHopRaw(5, IPAddress.Parse("1.1.1.1"), [9.0, 9.1, 9.2]),
        ];
        _dns.Reverse[IPAddress.Parse("62.115.1.1")] = "core1.example.net";
        _dns.Reverse[IPAddress.Parse("10.244.0.1")] = "node-secret.internal";

        var result = await Create().TracerouteAsync(new DestinationRequest { Destination = "1.1.1.1" }, "req-12345678", default);

        Assert.True(result.ReachedDestination);
        Assert.All(result.Hops.Take(2), h =>
        {
            Assert.True(h.Redacted);
            Assert.Null(h.Address);
            Assert.Null(h.Hostname);
            Assert.True(h.Responded);
        });
        Assert.False(result.Hops[2].Responded);
        Assert.Equal("core1.example.net", result.Hops[3].Hostname);
        Assert.Equal(5.1, result.Hops[3].AvgMs);
        Assert.DoesNotContain("10.244", result.TechnicalOutput);
        Assert.DoesNotContain("100.64", result.TechnicalOutput);
        Assert.DoesNotContain("node-secret", result.TechnicalOutput);
        Assert.Contains("[internal network]", result.TechnicalOutput);
        Assert.Contains("* * *", result.TechnicalOutput);
        Assert.Contains("core1.example.net (62.115.1.1)", result.TechnicalOutput);
    }

    [Fact]
    public async Task Redaction_can_be_disabled()
    {
        _probes.Trace = [new TraceHopRaw(1, IPAddress.Parse("10.244.0.1"), [0.4])];
        var result = await Create(o => o.RedactPrivateHops = false)
            .TracerouteAsync(new DestinationRequest { Destination = "1.1.1.1" }, "req-12345678", default);
        Assert.Equal("10.244.0.1", result.Hops[0].Address);
        Assert.False(result.Hops[0].Redacted);
    }

    [Fact]
    public async Task Mtr_redacts_and_renders_table()
    {
        _probes.Mtr = new MtrRaw(5,
        [
            new MtrHopRaw(1, IPAddress.Parse("192.168.5.1"), 0, 5, 0.5, 0.6, 0.4, 1.0, 0.2),
            new MtrHopRaw(2, null, 100, 5, null, null, null, null, null),
            new MtrHopRaw(3, IPAddress.Parse("1.1.1.1"), 20, 5, 12.3, 12.5, 11.9, 13.4, 0.6),
        ]);

        var result = await Create().MtrAsync(new DestinationRequest { Destination = "1.1.1.1" }, "req-12345678", default);

        Assert.True(result.Hops[0].Redacted);
        Assert.False(result.Hops[1].Responded);
        Assert.Equal("1.1.1.1", result.Hops[2].Address);
        Assert.DoesNotContain("192.168", result.TechnicalOutput);
        Assert.Contains("???", result.TechnicalOutput);
        Assert.Contains("20.0%", result.TechnicalOutput);
    }
}

public class NativeProbeRunnerTests
{
    private readonly FakeProcessRunner _processes = new();

    private NativeProbeRunner Create() =>
        new(_processes, TestOptions.Diagnostics(), DestinationPolicy.Default, NullLogger<NativeProbeRunner>.Instance);

    [Fact]
    public async Task Ping_arguments_are_a_fixed_array_ending_with_the_ip_literal()
    {
        _processes.Result = new ProcessResult(0, "5 packets transmitted, 5 received, 0% packet loss, time 1ms\nrtt min/avg/max/mdev = 1/2/3/0.5 ms", string.Empty, false);
        await Create().PingAsync(IPAddress.Parse("8.8.8.8"), default);

        var (file, args) = Assert.Single(_processes.Calls);
        Assert.Equal("/usr/bin/ping", file);
        Assert.Equal("8.8.8.8", args[^1]);
        Assert.Contains("-4", args);
        Assert.Contains("-n", args);
    }

    [Fact]
    public async Task Ipv6_targets_use_the_v6_flag()
    {
        _processes.Result = new ProcessResult(0, "traceroute to x\n 1  2606:4700:4700::1111  1.0 ms", string.Empty, false);
        await Create().TracerouteAsync(IPAddress.Parse("2606:4700:4700::1111"), default);
        Assert.Contains("-6", _processes.Calls[0].Args);
    }

    [Fact]
    public async Task Blocked_targets_never_reach_the_process_runner()
    {
        var runner = Create();
        await Assert.ThrowsAsync<LookingGlassException>(() => runner.PingAsync(IPAddress.Parse("10.0.0.1"), default));
        await Assert.ThrowsAsync<LookingGlassException>(() => runner.TracerouteAsync(IPAddress.Parse("127.0.0.1"), default));
        await Assert.ThrowsAsync<LookingGlassException>(() => runner.MtrAsync(IPAddress.Parse("fe80::1"), default));
        Assert.Empty(_processes.Calls);
    }

    [Fact]
    public async Task Tool_failures_do_not_leak_stderr()
    {
        _processes.Result = new ProcessResult(2, string.Empty, "ping: socket: Operation not permitted (pod secret-node-7)", false);
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => Create().PingAsync(IPAddress.Parse("8.8.8.8"), default));
        Assert.Equal(ProblemCodes.DiagnosticFailed, ex.Code);
        Assert.DoesNotContain("secret-node", ex.Message);
    }

    [Fact]
    public async Task Unreachable_networks_get_a_friendly_message()
    {
        _processes.Result = new ProcessResult(2, string.Empty, "ping: connect: Network is unreachable", false);
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => Create().PingAsync(IPAddress.Parse("2606:4700:4700::1111"), default));
        Assert.Equal("The Looking Glass has no route to that destination.", ex.Message);
    }

    [Fact]
    public async Task Ping_exit_code_one_with_summary_is_total_loss_not_an_error()
    {
        _processes.Result = new ProcessResult(1, "5 packets transmitted, 0 received, 100% packet loss, time 4000ms", string.Empty, false);
        var result = await Create().PingAsync(IPAddress.Parse("8.8.8.8"), default);
        Assert.Equal(100, result.LossPercent);
    }
}

public class DnsLookupServiceTests
{
    private readonly FakeDnsQuery _query = new();

    private DnsLookupService Create() =>
        new(_query, DestinationPolicy.Default, new DiagnosticsExecutor(TestOptions.Diagnostics()), TimeProvider.System);

    [Fact]
    public async Task Returns_records_with_ttl()
    {
        _query.Handler = (_, _) => new DnsQueryResult("NoError", [new DnsRecord("example.com", "MX", 300, "10 mail.example.com")]);
        var result = await Create().LookupAsync(new DnsLookupRequest { Name = "Example.com", RecordType = "mx" }, "req-12345678", default);

        Assert.Equal("ok", result.Status);
        Assert.Equal("MX", result.RecordType);
        Assert.Equal("example.com", result.Name);
        Assert.Equal(300, Assert.Single(result.Records).Ttl);
        Assert.Contains("example.com. 300 IN MX 10 mail.example.com", result.TechnicalOutput);
    }

    [Fact]
    public async Task Distinguishes_nodata_and_nxdomain()
    {
        _query.Handler = (_, _) => new DnsQueryResult("NoError", []);
        Assert.Equal("nodata", (await Create().LookupAsync(new DnsLookupRequest { Name = "example.com", RecordType = "AAAA" }, "req-12345678", default)).Status);

        _query.Handler = (_, _) => new DnsQueryResult("NotExistentDomain", []);
        Assert.Equal("nxdomain", (await Create().LookupAsync(new DnsLookupRequest { Name = "nope.example.com", RecordType = "A" }, "req-12345678", default)).Status);
    }

    [Fact]
    public async Task Cname_only_answer_for_an_a_query_counts_as_nodata_for_the_requested_type()
    {
        _query.Handler = (_, _) => new DnsQueryResult("NoError", [new DnsRecord("www.example.com", "CNAME", 60, "example.com")]);
        var result = await Create().LookupAsync(new DnsLookupRequest { Name = "www.example.com", RecordType = "A" }, "req-12345678", default);
        Assert.Equal("nodata", result.Status);
        Assert.Single(result.Records);
    }

    [Fact]
    public async Task Ptr_lookups_take_an_ip_and_query_the_reverse_name()
    {
        _query.Handler = (_, _) => new DnsQueryResult("NoError", [new DnsRecord("8.8.8.8.in-addr.arpa", "PTR", 300, "dns.google")]);
        var result = await Create().LookupAsync(new DnsLookupRequest { Name = "8.8.8.8", RecordType = "PTR" }, "req-12345678", default);
        Assert.Equal("8.8.8.8.in-addr.arpa", _query.Queries[0].Name);
        Assert.Equal("8.8.8.8", result.Name);
    }

    [Theory]
    [InlineData("10.0.0.1", "PTR")]
    [InlineData("127.0.0.1", "PTR")]
    [InlineData("db.internal", "A")]
    [InlineData("svc.cluster.local", "A")]
    [InlineData("kubernetes.default.svc", "A")]
    [InlineData("localhost", "A")]
    [InlineData("example.com", "PTR")]
    [InlineData("8.8.8.8", "A")]
    [InlineData("example.com", "AXFR")]
    [InlineData("example.com", "ANY")]
    [InlineData("example.com; id", "A")]
    [InlineData("example.com", null)]
    public async Task Rejects_disallowed_lookups_without_querying(string name, string? type)
    {
        await Assert.ThrowsAsync<LookingGlassException>(() =>
            Create().LookupAsync(new DnsLookupRequest { Name = name, RecordType = type }, "req-12345678", default));
        Assert.Empty(_query.Queries);
    }

    [Fact]
    public async Task Servfail_is_a_diagnostic_failure()
    {
        _query.Handler = (_, _) => new DnsQueryResult("ServerFailure", []);
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() =>
            Create().LookupAsync(new DnsLookupRequest { Name = "example.com", RecordType = "A" }, "req-12345678", default));
        Assert.Equal(ProblemCodes.DiagnosticFailed, ex.Code);
    }

    [Fact]
    public async Task Underscore_labels_are_allowed_for_txt()
    {
        _query.Handler = (_, _) => new DnsQueryResult("NoError", [new DnsRecord("_dmarc.example.com", "TXT", 300, "\"v=DMARC1\"")]);
        var result = await Create().LookupAsync(new DnsLookupRequest { Name = "_dmarc.example.com", RecordType = "TXT" }, "req-12345678", default);
        Assert.Equal("ok", result.Status);
    }
}

public class HostResolverTests
{
    [Fact]
    public void Builds_reverse_names()
    {
        Assert.Equal("4.3.2.1.in-addr.arpa", HostResolver.ReverseName(IPAddress.Parse("1.2.3.4")));
        Assert.Equal(
            "1.1.1.1" + string.Concat(Enumerable.Repeat(".0", 16)) + ".0.0.7.4.0.0.7.4.6.0.6.2.ip6.arpa",
            HostResolver.ReverseName(IPAddress.Parse("2606:4700:4700::1111")));
    }

    [Fact]
    public async Task Resolves_both_families_from_a_and_aaaa_answers()
    {
        var query = new FakeDnsQuery
        {
            Handler = (_, type) => type == "A"
                ? new DnsQueryResult("NoError", [new DnsRecord("x.example.com", "A", 60, "93.184.216.34"), new DnsRecord("x.example.com", "CNAME", 60, "y.example.com")])
                : new DnsQueryResult("NoError", [new DnsRecord("x.example.com", "AAAA", 60, "2606:2800:220:1::1")]),
        };
        var addresses = await new HostResolver(query).ResolveAsync("x.example.com", IpFamily.Auto, default);
        Assert.Equal(2, addresses.Count);
    }
}
