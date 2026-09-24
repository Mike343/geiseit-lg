using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Execution;

namespace GeiseIT.LookingGlass.Diagnostics.Tests;

public class ProcessRunnerTests
{
    private readonly ProcessRunner _runner = new();

    private static (string File, string[] Args) Echo() =>
        OperatingSystem.IsWindows() ? ("cmd.exe", ["/c", "echo hello"]) : ("/bin/echo", ["hello"]);

    private static (string File, string[] Args) Exit(int code) =>
        OperatingSystem.IsWindows() ? ("cmd.exe", ["/c", $"exit {code}"]) : ("/bin/sh", ["-c", $"exit {code}"]);

    private static (string File, string[] Args) Sleep() =>
        OperatingSystem.IsWindows() ? ("ping.exe", ["-n", "60", "127.0.0.1"]) : ("/bin/sleep", ["60"]);

    private static (string File, string[] Args) Flood() =>
        OperatingSystem.IsWindows()
            ? ("cmd.exe", ["/c", "for /L %i in (1,1,200000) do @echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"])
            : ("/usr/bin/yes", ["xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]);

    [Fact]
    public async Task Captures_output_and_exit_code()
    {
        var (file, args) = Echo();
        var result = await _runner.RunAsync(file, args, 4096, default);
        Assert.Equal(0, result.ExitCode);
        Assert.Contains("hello", result.StdOut);
        Assert.False(result.Truncated);

        var (exitFile, exitArgs) = Exit(3);
        Assert.Equal(3, (await _runner.RunAsync(exitFile, exitArgs, 4096, default)).ExitCode);
    }

    [Fact]
    public async Task Arguments_are_passed_verbatim_not_through_a_shell()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var result = await _runner.RunAsync("/bin/echo", ["$(id)", ";", "&&", "`whoami`", "*"], 4096, default);
        Assert.Equal("$(id) ; && `whoami` *", result.StdOut.Trim());
    }

    [Fact]
    public async Task Cancellation_kills_the_process_promptly()
    {
        var (file, args) = Sleep();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(400));
        var started = DateTime.UtcNow;

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => _runner.RunAsync(file, args, 4096, cts.Token));

        Assert.True(DateTime.UtcNow - started < TimeSpan.FromSeconds(10));
    }

    [Fact]
    public async Task Output_beyond_the_limit_stops_the_process_and_is_flagged()
    {
        var (file, args) = Flood();
        var started = DateTime.UtcNow;

        var result = await _runner.RunAsync(file, args, 2048, default);

        Assert.True(result.Truncated);
        Assert.True(result.StdOut.Length <= 2048);
        Assert.True(DateTime.UtcNow - started < TimeSpan.FromSeconds(20));
    }

    [Fact]
    public async Task Missing_binary_surfaces_as_win32_exception()
    {
        await Assert.ThrowsAsync<System.ComponentModel.Win32Exception>(() =>
            _runner.RunAsync("/definitely/not/here", [], 1024, default));
    }
}

public class DiagnosticsExecutorTests
{
    [Fact]
    public async Task Work_beyond_the_deadline_becomes_a_timeout()
    {
        using var executor = new DiagnosticsExecutor(TestOptions.Diagnostics(o => o.TimeoutSeconds = 1));
        var ex = await Assert.ThrowsAsync<LookingGlassException>(() =>
            executor.ExecuteAsync("ping", async ct =>
            {
                await Task.Delay(Timeout.Infinite, ct);
                return 0;
            }, default));
        Assert.Equal(ProblemCodes.Timeout, ex.Code);
        Assert.Equal(504, ex.Status);
    }

    [Fact]
    public async Task Caller_cancellation_propagates_as_cancellation()
    {
        using var executor = new DiagnosticsExecutor(TestOptions.Diagnostics());
        using var cts = new CancellationTokenSource();
        var task = executor.ExecuteAsync("ping", async ct =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return 0;
        }, cts.Token);

        await cts.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }

    [Fact]
    public async Task Concurrency_is_capped_and_overflow_is_rejected_as_busy()
    {
        using var executor = new DiagnosticsExecutor(TestOptions.Diagnostics(o =>
        {
            o.MaxConcurrent = 1;
            o.MaxQueued = 1;
            o.QueueWaitSeconds = 30;
        }));
        var gate = new TaskCompletionSource();
        var running = 0;
        var peak = 0;

        async Task<int> Work(CancellationToken ct)
        {
            var now = Interlocked.Increment(ref running);
            peak = Math.Max(peak, now);
            await gate.Task.WaitAsync(ct);
            Interlocked.Decrement(ref running);
            return 1;
        }

        var first = executor.ExecuteAsync("ping", Work, default);
        await WaitUntil(() => running == 1);
        var second = executor.ExecuteAsync("ping", Work, default);
        await WaitUntil(() => executor.Waiting == 1);

        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => executor.ExecuteAsync("ping", Work, default));
        Assert.Equal(ProblemCodes.Busy, ex.Code);
        Assert.NotNull(ex.RetryAfterSeconds);

        gate.SetResult();
        await Task.WhenAll(first, second);
        Assert.Equal(1, peak);
    }

    [Fact]
    public async Task Queued_work_gives_up_after_the_wait_budget()
    {
        using var executor = new DiagnosticsExecutor(TestOptions.Diagnostics(o =>
        {
            o.MaxConcurrent = 1;
            o.MaxQueued = 4;
            o.QueueWaitSeconds = 1;
        }));
        var gate = new TaskCompletionSource();
        var first = executor.ExecuteAsync("ping", async ct =>
        {
            await gate.Task.WaitAsync(ct);
            return 1;
        }, default);

        var ex = await Assert.ThrowsAsync<LookingGlassException>(() => executor.ExecuteAsync("ping", _ => Task.FromResult(2), default));
        Assert.Equal(ProblemCodes.Busy, ex.Code);

        gate.SetResult();
        await first;
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "Condition was not met in time");
            await Task.Delay(10);
        }
    }
}
