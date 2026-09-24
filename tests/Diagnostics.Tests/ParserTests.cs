using System.Net;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Probes;

namespace GeiseIT.LookingGlass.Diagnostics.Tests;

public class PingParserTests
{
    private const string Success = """
        PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.
        64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=11.2 ms
        64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=12.7 ms
        64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=14.4 ms

        --- 8.8.8.8 ping statistics ---
        3 packets transmitted, 3 received, 0% packet loss, time 1003ms
        rtt min/avg/max/mdev = 11.200/12.767/14.400/1.317 ms
        """;

    private const string TotalLoss = """
        PING 203.0.113.9 (203.0.113.9) 56(84) bytes of data.
        From 10.0.0.1 icmp_seq=1 Destination Host Unreachable

        --- 203.0.113.9 ping statistics ---
        5 packets transmitted, 0 received, +5 errors, 100% packet loss, time 4090ms
        """;

    [Fact]
    public void Parses_successful_ping()
    {
        var result = PingParser.Parse(Success)!;
        Assert.Equal(3, result.Transmitted);
        Assert.Equal(3, result.Received);
        Assert.Equal(0, result.LossPercent);
        Assert.Equal(11.2, result.MinMs);
        Assert.Equal(12.767, result.AvgMs);
        Assert.Equal(14.4, result.MaxMs);
        Assert.Equal(1.317, result.StdDevMs);
        Assert.Equal(3, result.Replies.Count);
        Assert.Equal(new PingReply(2, 117, 12.7), result.Replies[1]);
    }

    [Fact]
    public void Parses_total_loss_without_rtt_line()
    {
        var result = PingParser.Parse(TotalLoss)!;
        Assert.Equal(5, result.Transmitted);
        Assert.Equal(0, result.Received);
        Assert.Equal(100, result.LossPercent);
        Assert.Null(result.AvgMs);
        Assert.Empty(result.Replies);
    }

    [Fact]
    public void Parses_ipv6_reply_lines()
    {
        const string output = """
            PING 2606:4700:4700::1111 (2606:4700:4700::1111) 56 data bytes
            64 bytes from 2606:4700:4700::1111: icmp_seq=1 ttl=58 time=8.51 ms

            --- 2606:4700:4700::1111 ping statistics ---
            1 packets transmitted, 1 received, 0% packet loss, time 0ms
            rtt min/avg/max/mdev = 8.510/8.510/8.510/0.000 ms
            """;
        var result = PingParser.Parse(output)!;
        Assert.Single(result.Replies);
        Assert.Equal(8.51, result.Replies[0].TimeMs);
    }

    [Theory]
    [InlineData("")]
    [InlineData("ping: socket: Operation not permitted")]
    [InlineData("garbage")]
    public void Returns_null_when_no_summary(string output) => Assert.Null(PingParser.Parse(output));
}

public class TracerouteParserTests
{
    private const string Output = """
        traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
         1  10.244.0.1  0.412 ms  0.301 ms  0.288 ms
         2  * * *
         3  72.14.1.1  5.123 ms 72.14.1.2  5.301 ms  5.0 ms
         4  203.0.113.9  6.1 ms !H  * 6.4 ms
         5  8.8.8.8  11.2 ms  11.3 ms  11.4 ms
        """;

    [Fact]
    public void Parses_hops_addresses_and_rtts()
    {
        var hops = TracerouteParser.Parse(Output);
        Assert.Equal(5, hops.Count);

        Assert.Equal(IPAddress.Parse("10.244.0.1"), hops[0].Address);
        Assert.Equal([0.412, 0.301, 0.288], hops[0].RttMs);

        Assert.Null(hops[1].Address);
        Assert.Equal(new double?[] { null, null, null }, hops[1].RttMs);

        Assert.Equal(IPAddress.Parse("72.14.1.1"), hops[2].Address);
        Assert.Equal(3, hops[2].RttMs.Count);

        Assert.Equal(new double?[] { 6.1, null, 6.4 }, hops[3].RttMs);
        Assert.Equal(IPAddress.Parse("8.8.8.8"), hops[4].Address);
    }

    [Fact]
    public void Parses_ipv6_hops()
    {
        const string output = """
            traceroute to 2606:4700:4700::1111 (2606:4700:4700::1111), 30 hops max, 80 byte packets
             1  fe80::1  1.2 ms  1.1 ms  1.0 ms
             2  2001:db8::1  5.0 ms  5.1 ms  5.2 ms
            """;
        var hops = TracerouteParser.Parse(output);
        Assert.Equal(IPAddress.Parse("2001:db8::1"), hops[1].Address);
    }

    [Fact]
    public void Ignores_header_and_noise() => Assert.Empty(TracerouteParser.Parse("traceroute: Warning: something\n"));
}

public class MtrParserTests
{
    private const string Json = """
        {"report":{"mtr":{"src":"pod-1","dst":"1.1.1.1","tos":0,"tests":5,"psize":"64","bitpattern":"0x00"},
        "hubs":[
        {"count":1,"host":"10.0.0.1","Loss%":0.0,"Snt":5,"Last":0.5,"Avg":0.6,"Best":0.4,"Wrst":1.0,"StDev":0.2},
        {"count":2,"host":"???","Loss%":100.0,"Snt":5,"Last":0.0,"Avg":0.0,"Best":0.0,"Wrst":0.0,"StDev":0.0},
        {"count":3,"host":"1.1.1.1","Loss%":20.0,"Snt":5,"Last":12.3,"Avg":12.5,"Best":11.9,"Wrst":13.4,"StDev":0.6}
        ]}}
        """;

    [Fact]
    public void Parses_hubs()
    {
        var result = MtrParser.Parse(Json);
        Assert.Equal(5, result.Cycles);
        Assert.Equal(3, result.Hops.Count);
        Assert.Equal(IPAddress.Parse("10.0.0.1"), result.Hops[0].Address);
        Assert.Null(result.Hops[1].Address);
        Assert.Null(result.Hops[1].AvgMs);
        Assert.Equal(100, result.Hops[1].LossPercent);
        Assert.Equal(20, result.Hops[2].LossPercent);
        Assert.Equal(12.5, result.Hops[2].AvgMs);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("{\"report\":{}}")]
    public void Malformed_output_is_a_controlled_failure(string json)
    {
        var ex = Assert.Throws<LookingGlassException>(() => MtrParser.Parse(json));
        Assert.Equal(ProblemCodes.DiagnosticFailed, ex.Code);
    }
}
