using System.Net;
using System.Text;
using DnsClient;
using DnsClient.Protocol;
using GeiseIT.LookingGlass.Contracts;
using GeiseIT.LookingGlass.Contracts.Hosting;
using Microsoft.Extensions.Options;

namespace GeiseIT.LookingGlass.Diagnostics.Dns;

public sealed record DnsQueryResult(string ResponseCode, IReadOnlyList<DnsRecord> Answers);

public interface IDnsQuery
{
    Task<DnsQueryResult> QueryAsync(string name, string recordType, CancellationToken cancellationToken);
}

public sealed class DnsClientQuery : IDnsQuery
{
    private readonly LookupClient _client;

    public DnsClientQuery(IOptions<DnsOptions> options)
    {
        var settings = options.Value;
        var servers = LookingGlassConfiguration.SplitList(settings.Resolvers)
            .Select(s => IPAddress.TryParse(s, out var ip)
                ? new IPEndPoint(ip, 53)
                : throw new InvalidOperationException($"Dns:Resolvers contains an invalid IP address '{s}'."))
            .ToArray();

        if (servers.Length == 0)
        {
            throw new InvalidOperationException("Dns:Resolvers must contain at least one resolver IP address.");
        }

        _client = new LookupClient(new LookupClientOptions(servers)
        {
            UseCache = false,
            Timeout = TimeSpan.FromSeconds(settings.TimeoutSeconds),
            Retries = settings.Retries,
            ThrowDnsErrors = false,
            UseTcpFallback = true,
            EnableAuditTrail = false,
            ContinueOnDnsError = true,
        });
    }

    public async Task<DnsQueryResult> QueryAsync(string name, string recordType, CancellationToken cancellationToken)
    {
        var queryType = Enum.Parse<QueryType>(recordType, ignoreCase: true);
        try
        {
            var response = await _client.QueryAsync(name, queryType, QueryClass.IN, cancellationToken);
            var records = response.Answers.Select(Map).Where(r => r is not null).Select(r => r!).ToList();
            return new DnsQueryResult(response.Header.ResponseCode.ToString(), records);
        }
        catch (DnsResponseException ex)
        {
            throw LookingGlassException.Failed("The DNS lookup could not be completed.", ex);
        }
    }

    private static DnsRecord? Map(DnsResourceRecord record)
    {
        var name = Trim(record.DomainName.Value);
        var ttl = record.TimeToLive;
        return record switch
        {
            ARecord a => new DnsRecord(name, "A", ttl, a.Address.ToString()),
            AaaaRecord aaaa => new DnsRecord(name, "AAAA", ttl, aaaa.Address.ToString()),
            CNameRecord cname => new DnsRecord(name, "CNAME", ttl, Trim(cname.CanonicalName.Value)),
            MxRecord mx => new DnsRecord(name, "MX", ttl, $"{mx.Preference} {Trim(mx.Exchange.Value)}"),
            NsRecord ns => new DnsRecord(name, "NS", ttl, Trim(ns.NSDName.Value)),
            PtrRecord ptr => new DnsRecord(name, "PTR", ttl, Trim(ptr.PtrDomainName.Value)),
            TxtRecord txt => new DnsRecord(name, "TXT", ttl, string.Join(' ', txt.Text.Select(t => $"\"{t}\""))),
            SoaRecord soa => new DnsRecord(
                name,
                "SOA",
                ttl,
                $"{Trim(soa.MName.Value)} {Trim(soa.RName.Value)} {soa.Serial} {soa.Refresh} {soa.Retry} {soa.Expire} {soa.Minimum}"),
            _ => null,
        };
    }

    private static string Trim(string value) => value == "." ? value : value.TrimEnd('.');
}

public interface IHostResolver
{
    Task<IReadOnlyList<IPAddress>> ResolveAsync(string host, IpFamily family, CancellationToken cancellationToken);

    Task<string?> ReverseAsync(IPAddress address, CancellationToken cancellationToken);
}

public sealed class HostResolver(IDnsQuery query) : IHostResolver
{
    public async Task<IReadOnlyList<IPAddress>> ResolveAsync(string host, IpFamily family, CancellationToken cancellationToken)
    {
        var tasks = new List<Task<DnsQueryResult>>();
        if (family is IpFamily.Auto or IpFamily.Ipv4)
        {
            tasks.Add(query.QueryAsync(host, "A", cancellationToken));
        }

        if (family is IpFamily.Auto or IpFamily.Ipv6)
        {
            tasks.Add(query.QueryAsync(host, "AAAA", cancellationToken));
        }

        var results = await Task.WhenAll(tasks);
        return
        [
            .. results
                .SelectMany(r => r.Answers)
                .Where(r => r.Type is "A" or "AAAA")
                .Select(r => IPAddress.Parse(r.Value))
                .Distinct(),
        ];
    }

    public async Task<string?> ReverseAsync(IPAddress address, CancellationToken cancellationToken)
    {
        try
        {
            var result = await query.QueryAsync(ReverseName(address), "PTR", cancellationToken);
            return result.Answers.FirstOrDefault(r => r.Type == "PTR")?.Value;
        }
        catch (LookingGlassException)
        {
            return null;
        }
    }

    public static string ReverseName(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        if (bytes.Length == 4)
        {
            return $"{bytes[3]}.{bytes[2]}.{bytes[1]}.{bytes[0]}.in-addr.arpa";
        }

        var builder = new StringBuilder(72);
        for (var i = bytes.Length - 1; i >= 0; i--)
        {
            builder.Append((bytes[i] & 0x0f).ToString("x")).Append('.');
            builder.Append((bytes[i] >> 4).ToString("x")).Append('.');
        }

        return builder.Append("ip6.arpa").ToString();
    }
}
