using System.Diagnostics;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Metrics;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Execution;

public sealed class DiagnosticsExecutor : IDisposable
{
    private readonly SemaphoreSlim _slots;
    private readonly IOptions<DiagnosticsOptions> _options;
    private int _waiting;

    public DiagnosticsExecutor(IOptions<DiagnosticsOptions> options)
    {
        _options = options;
        _slots = new SemaphoreSlim(options.Value.MaxConcurrent, options.Value.MaxConcurrent);
    }

    public int Waiting => Volatile.Read(ref _waiting);

    public async Task<T> ExecuteAsync<T>(string type, Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        var settings = _options.Value;
        DiagnosticsMetrics.Requests.WithLabels(type).Inc();

        await AcquireAsync(type, settings, cancellationToken);
        var stopwatch = Stopwatch.StartNew();
        DiagnosticsMetrics.Active.Inc();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));

        try
        {
            return await work(timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            DiagnosticsMetrics.RequestsFailed.WithLabels(type, ProblemCodes.Timeout).Inc();
            throw LookingGlassException.Timeout();
        }
        catch (OperationCanceledException)
        {
            DiagnosticsMetrics.RequestsFailed.WithLabels(type, ProblemCodes.Cancelled).Inc();
            throw;
        }
        catch (LookingGlassException ex)
        {
            DiagnosticsMetrics.RequestsFailed.WithLabels(type, ex.Code).Inc();
            if (ex.Code is ProblemCodes.ValidationFailed or ProblemCodes.DestinationBlocked)
            {
                DiagnosticsMetrics.Rejected.WithLabels(ex.Code).Inc();
            }

            throw;
        }
        catch (Exception)
        {
            DiagnosticsMetrics.RequestsFailed.WithLabels(type, ProblemCodes.Internal).Inc();
            throw;
        }
        finally
        {
            stopwatch.Stop();
            DiagnosticsMetrics.RequestDuration.WithLabels(type).Observe(stopwatch.Elapsed.TotalSeconds);
            DiagnosticsMetrics.Active.Dec();
            _slots.Release();
        }
    }

    public void Dispose() => _slots.Dispose();

    private async Task AcquireAsync(string type, DiagnosticsOptions settings, CancellationToken cancellationToken)
    {
        if (await _slots.WaitAsync(0, cancellationToken))
        {
            return;
        }

        if (Interlocked.Increment(ref _waiting) > settings.MaxQueued)
        {
            Interlocked.Decrement(ref _waiting);
            DiagnosticsMetrics.Rejected.WithLabels("queue_full").Inc();
            DiagnosticsMetrics.RequestsFailed.WithLabels(type, ProblemCodes.Busy).Inc();
            throw LookingGlassException.Busy();
        }

        try
        {
            if (!await _slots.WaitAsync(TimeSpan.FromSeconds(settings.QueueWaitSeconds), cancellationToken))
            {
                DiagnosticsMetrics.Rejected.WithLabels("queue_timeout").Inc();
                DiagnosticsMetrics.RequestsFailed.WithLabels(type, ProblemCodes.Busy).Inc();
                throw LookingGlassException.Busy();
            }
        }
        finally
        {
            Interlocked.Decrement(ref _waiting);
        }
    }
}
