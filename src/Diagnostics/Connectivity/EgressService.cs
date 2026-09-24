using System.Net;
using System.Net.Sockets;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Diagnostics.Dns;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Connectivity;

public sealed class EgressService : IDisposable
{
    private static readonly TimeSpan FailureCache = TimeSpan.FromMinutes(1);

    private readonly EgressOptions _options;
    private readonly TimeProvider _time;
    private readonly ILogger<EgressService> _logger;
    private readonly HttpClient _ipv4Client;
    private readonly HttpClient _ipv6Client;
    private readonly SemaphoreSlim _refresh = new(1, 1);
    private EgressAddresses? _cached;
    private DateTimeOffset _expires;

    public EgressService(IOptions<EgressOptions> options, IHostResolver resolver, TimeProvider time, ILogger<EgressService> logger)
    {
        _options = options.Value;
        _time = time;
        _logger = logger;
        _ipv4Client = CreateClient(AddressFamily.InterNetwork, resolver);
        _ipv6Client = CreateClient(AddressFamily.InterNetworkV6, resolver);
    }

    public async Task<EgressAddresses> GetAsync(CancellationToken cancellationToken)
    {
        var configured = new EgressAddresses(
            Validate(_options.Ipv4, AddressFamily.InterNetwork),
            Validate(_options.Ipv6, AddressFamily.InterNetworkV6));

        if (!_options.Enabled || (configured.Ipv4 is not null && configured.Ipv6 is not null))
        {
            return configured;
        }

        if (_cached is not null && _time.GetUtcNow() < _expires)
        {
            return Merge(configured, _cached);
        }

        await _refresh.WaitAsync(cancellationToken);
        try
        {
            if (_cached is not null && _time.GetUtcNow() < _expires)
            {
                return Merge(configured, _cached);
            }

            var v4 = configured.Ipv4 is null ? DiscoverAsync(_ipv4Client, _options.Ipv4Url, AddressFamily.InterNetwork, cancellationToken) : Task.FromResult<string?>(null);
            var v6 = configured.Ipv6 is null ? DiscoverAsync(_ipv6Client, _options.Ipv6Url, AddressFamily.InterNetworkV6, cancellationToken) : Task.FromResult<string?>(null);
            await Task.WhenAll(v4, v6);

            _cached = new EgressAddresses(v4.Result, v6.Result);
            var ttl = _cached.Ipv4 is null && _cached.Ipv6 is null ? FailureCache : TimeSpan.FromMinutes(_options.CacheMinutes);
            _expires = _time.GetUtcNow() + ttl;
            return Merge(configured, _cached);
        }
        finally
        {
            _refresh.Release();
        }
    }

    public void Dispose()
    {
        _ipv4Client.Dispose();
        _ipv6Client.Dispose();
        _refresh.Dispose();
    }

    private static EgressAddresses Merge(EgressAddresses configured, EgressAddresses discovered) =>
        new(configured.Ipv4 ?? discovered.Ipv4, configured.Ipv6 ?? discovered.Ipv6);

    private static string? Validate(string? value, AddressFamily family) =>
        IPAddress.TryParse(value, out var ip) && ip.AddressFamily == family ? ip.ToString() : null;

    private async Task<string?> DiscoverAsync(HttpClient client, string url, AddressFamily family, CancellationToken cancellationToken)
    {
        try
        {
            var body = (await client.GetStringAsync(url, cancellationToken)).Trim();
            return Validate(body, family);
        }
        catch (Exception ex) when (ex is HttpRequestException or SocketException or TaskCanceledException or InvalidOperationException)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            _logger.LogInformation("Egress {Family} address could not be discovered: {Reason}", family, ex.Message);
            return null;
        }
    }

    private static HttpClient CreateClient(AddressFamily family, IHostResolver resolver)
    {
        var handler = new SocketsHttpHandler
        {
            ConnectTimeout = TimeSpan.FromSeconds(3),
            ConnectCallback = async (context, ct) =>
            {
                var addresses = await resolver.ResolveAsync(
                    context.DnsEndPoint.Host,
                    family == AddressFamily.InterNetworkV6 ? IpFamily.Ipv6 : IpFamily.Ipv4,
                    ct);
                if (addresses.Count == 0)
                {
                    throw new SocketException((int)SocketError.HostNotFound);
                }

                var socket = new Socket(family, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                try
                {
                    await socket.ConnectAsync(addresses[0], context.DnsEndPoint.Port, ct);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            },
        };

        return new HttpClient(handler, disposeHandler: true) { Timeout = TimeSpan.FromSeconds(6) };
    }
}
