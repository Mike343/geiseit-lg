using GeiseIT.LookingGlass.Contracts;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Api.Services;

public sealed class ActivityLog(IOptions<ActivityOptions> options, TimeProvider time)
{
    private readonly Lock _gate = new();
    private readonly List<ActivityItem> _items = [];

    public void Add(string type, string target, string summary)
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            return;
        }

        lock (_gate)
        {
            Prune(settings);
            _items.Insert(0, new ActivityItem { Type = type, Target = target, Summary = summary, At = time.GetUtcNow() });
            if (_items.Count > settings.MaxItems)
            {
                _items.RemoveRange(settings.MaxItems, _items.Count - settings.MaxItems);
            }
        }
    }

    public ActivityResponse Snapshot()
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            return new ActivityResponse { Enabled = false };
        }

        lock (_gate)
        {
            Prune(settings);
            return new ActivityResponse { Enabled = true, Items = [.. _items] };
        }
    }

    private void Prune(ActivityOptions settings)
    {
        var cutoff = time.GetUtcNow().AddMinutes(-settings.RetentionMinutes);
        _items.RemoveAll(i => i.At < cutoff);
    }
}
