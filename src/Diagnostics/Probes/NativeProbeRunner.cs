using System.Globalization;
using System.Net;
using System.Net.Sockets;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Networking;
using GeiseIT.LookingGlass.Diagnostics.Execution;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Probes;

public interface IProbeRunner
{
    Task<PingRaw> PingAsync(IPAddress target, CancellationToken cancellationToken);

    Task<IReadOnlyList<TraceHopRaw>> TracerouteAsync(IPAddress target, CancellationToken cancellationToken);

    Task<MtrRaw> MtrAsync(IPAddress target, CancellationToken cancellationToken);
}

public sealed class NativeProbeRunner(
    IProcessRunner processes,
    IOptions<DiagnosticsOptions> options,
    DestinationPolicy policy,
    ILogger<NativeProbeRunner> logger) : IProbeRunner
{
    private DiagnosticsOptions Settings => options.Value;

    public async Task<PingRaw> PingAsync(IPAddress target, CancellationToken cancellationToken)
    {
        var ping = Settings.Ping;
        var deadline = (int)Math.Ceiling(ping.Count * (ping.IntervalSeconds + ping.PacketTimeoutSeconds)) + 1;
        var result = await RunAsync(
            Settings.Tools.Ping,
            [
                "-n",
                FamilyFlag(target),
                "-c", ping.Count.ToString(CultureInfo.InvariantCulture),
                "-i", ping.IntervalSeconds.ToString("0.0#", CultureInfo.InvariantCulture),
                "-W", ping.PacketTimeoutSeconds.ToString(CultureInfo.InvariantCulture),
                "-w", deadline.ToString(CultureInfo.InvariantCulture),
                target.ToString(),
            ],
            target,
            cancellationToken);

        var parsed = PingParser.Parse(result.StdOut);
        if (parsed is null || result.ExitCode > 1)
        {
            throw Fail("ping", result);
        }

        return parsed;
    }

    public async Task<IReadOnlyList<TraceHopRaw>> TracerouteAsync(IPAddress target, CancellationToken cancellationToken)
    {
        var trace = Settings.Traceroute;
        var result = await RunAsync(
            Settings.Tools.Traceroute,
            [
                "-n",
                FamilyFlag(target),
                "-q", trace.Queries.ToString(CultureInfo.InvariantCulture),
                "-w", trace.WaitSeconds.ToString(CultureInfo.InvariantCulture),
                "-m", trace.MaxHops.ToString(CultureInfo.InvariantCulture),
                target.ToString(),
            ],
            target,
            cancellationToken);

        var hops = TracerouteParser.Parse(result.StdOut);
        if (result.ExitCode != 0 || hops.Count == 0)
        {
            throw Fail("traceroute", result);
        }

        return hops;
    }

    public async Task<MtrRaw> MtrAsync(IPAddress target, CancellationToken cancellationToken)
    {
        var mtr = Settings.Mtr;
        var result = await RunAsync(
            Settings.Tools.Mtr,
            [
                "--json",
                "--no-dns",
                FamilyFlag(target),
                "-c", mtr.Cycles.ToString(CultureInfo.InvariantCulture),
                "-i", mtr.IntervalSeconds.ToString(CultureInfo.InvariantCulture),
                "-G", mtr.GraceSeconds.ToString(CultureInfo.InvariantCulture),
                "-m", mtr.MaxHops.ToString(CultureInfo.InvariantCulture),
                target.ToString(),
            ],
            target,
            cancellationToken);

        if (result.ExitCode != 0)
        {
            throw Fail("mtr", result);
        }

        return MtrParser.Parse(result.StdOut);
    }

    private static string FamilyFlag(IPAddress target) =>
        target.AddressFamily == AddressFamily.InterNetworkV6 ? "-6" : "-4";

    private async Task<ProcessResult> RunAsync(
        string tool,
        IReadOnlyList<string> arguments,
        IPAddress target,
        CancellationToken cancellationToken)
    {
        if (policy.Blocklist.IsBlocked(target))
        {
            throw LookingGlassException.Blocked("That address is in a private, reserved or otherwise restricted range and cannot be tested.");
        }

        try
        {
            return await processes.RunAsync(tool, arguments, Settings.MaxOutputBytes, cancellationToken);
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            logger.LogError(ex, "Diagnostic tool {Tool} could not be started", tool);
            throw LookingGlassException.Failed("The Looking Glass could not run this diagnostic.", ex);
        }
    }

    private LookingGlassException Fail(string tool, ProcessResult result)
    {
        logger.LogWarning(
            "Diagnostic tool {Tool} failed with exit code {ExitCode}, truncated {Truncated}: {StdErr}",
            tool,
            result.ExitCode,
            result.Truncated,
            result.StdErr.Trim());
        return result.StdErr.Contains("unreachable", StringComparison.OrdinalIgnoreCase)
            ? LookingGlassException.Failed("The Looking Glass has no route to that destination.")
            : LookingGlassException.Failed("The diagnostic could not be completed.");
    }
}
