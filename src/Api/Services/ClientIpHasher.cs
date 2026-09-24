using System.Security.Cryptography;
using System.Text;

namespace GeiseIT.LookingGlass.Api.Services;

public sealed class ClientIpHasher(TimeProvider time)
{
    private readonly Lock _gate = new();
    private DateOnly _day;
    private byte[] _key = [];

    public string Hash(string? address)
    {
        if (string.IsNullOrEmpty(address))
        {
            return "unknown";
        }

        var key = CurrentKey();
        var digest = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(address));
        return Convert.ToHexStringLower(digest.AsSpan(0, 6));
    }

    private byte[] CurrentKey()
    {
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        lock (_gate)
        {
            if (today != _day)
            {
                _key = RandomNumberGenerator.GetBytes(32);
                _day = today;
            }

            return _key;
        }
    }
}
