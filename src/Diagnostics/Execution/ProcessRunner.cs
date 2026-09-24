using System.Diagnostics;
using System.Text;

namespace GeiseIT.LookingGlass.Diagnostics.Execution;

public sealed record ProcessResult(int ExitCode, string StdOut, string StdErr, bool Truncated);

public interface IProcessRunner
{
    Task<ProcessResult> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        int maxOutputBytes,
        CancellationToken cancellationToken);
}

public sealed class ProcessRunner : IProcessRunner
{
    private const int MaxErrorBytes = 8192;

    public async Task<ProcessResult> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        int maxOutputBytes,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo(fileName)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        if (!OperatingSystem.IsWindows())
        {
            startInfo.Environment.Clear();
            startInfo.Environment["LC_ALL"] = "C";
            startInfo.Environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin";
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        process.StandardInput.Close();

        using var registration = cancellationToken.Register(() => TryKill(process));

        var truncated = false;
        var stdout = ReadCappedAsync(process.StandardOutput, maxOutputBytes, () =>
        {
            truncated = true;
            TryKill(process);
        });
        var stderr = ReadCappedAsync(process.StandardError, MaxErrorBytes, () => { });

        try
        {
            await process.WaitForExitAsync(cancellationToken);
            await Task.WhenAll(stdout, stderr);
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }
        finally
        {
            TryKill(process);
        }

        return new ProcessResult(process.ExitCode, await stdout, await stderr, truncated);
    }

    private static async Task<string> ReadCappedAsync(StreamReader reader, int maxBytes, Action onLimit)
    {
        var builder = new StringBuilder();
        var buffer = new char[4096];
        var total = 0;

        while (true)
        {
            int read;
            try
            {
                read = await reader.ReadAsync(buffer);
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (IOException)
            {
                break;
            }

            if (read == 0)
            {
                break;
            }

            var bytes = Encoding.UTF8.GetByteCount(buffer.AsSpan(0, read));
            if (total + bytes > maxBytes)
            {
                var remaining = Math.Max(0, maxBytes - total);
                builder.Append(buffer, 0, Math.Min(read, remaining));
                onLimit();
                break;
            }

            total += bytes;
            builder.Append(buffer, 0, read);
        }

        return builder.ToString();
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (InvalidOperationException)
        {
        }
        catch (System.ComponentModel.Win32Exception)
        {
        }
    }
}
