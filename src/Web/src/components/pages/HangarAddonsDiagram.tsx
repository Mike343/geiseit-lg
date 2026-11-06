import { Arrow, Node } from "@/components/pages/ArchitectureDiagram";

export function HangarAddonsDiagram() {
  return (
    <figure>
      <div className="scroll-x rounded-xl" tabIndex={0} role="region" aria-label="Hangar Addons architecture diagram, scrollable">
        <svg viewBox="0 0 1040 540" role="img" aria-labelledby="hangar-title hangar-desc" className="mx-auto h-auto w-full min-w-[800px] max-w-5xl">
          <title id="hangar-title">Hangar Addons architecture</title>
          <desc id="hangar-desc">
            Visitors reach Cloudflare, which carries traffic into the cluster to an nginx ingress. The ingress sends pages through a page cache to the Next.js
            frontend, API calls straight to the ASP.NET Core API, and uploads to a static file server. The API uses an image service, the data tier and
            background workers. Prometheus, Loki and Tempo collect metrics, logs and traces. Everything runs on Kubernetes on servers I own.
          </desc>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 9 5 1 9z" className="fill-fg-3" />
            </marker>
          </defs>

          <rect x="330" y="14" width="700" height="460" rx="22" fill="none" strokeWidth="1.5" strokeDasharray="7 6" className="stroke-brand" />
          <text x="350" y="40" fontSize="12" fontWeight="600" letterSpacing="1.4" className="fill-brand-fg">
            KUBERNETES CLUSTER · GEISEIT-OWNED SERVERS
          </text>

          <Node x={10} y={200} w={130} title="Visitors" sub="Browser · App" />
          <Node x={170} y={200} w={130} title="Cloudflare" sub="CDN · Tunnel" />
          <Node x={350} y={200} w={130} title="Ingress" sub="nginx · TLS" />

          <Node x={520} y={60} w={130} title="Page cache" sub="nginx · 30 s" />
          <Node x={700} y={60} w={130} title="Frontend" sub="Next.js" />
          <Node x={870} y={60} w={150} title="Observability" sub="Metrics · Logs · Traces" />

          <Node x={520} y={200} w={130} title="API" sub="ASP.NET Core" accent />
          <Node x={700} y={200} w={250} title="Data tier" sub="Postgres · Redis · RabbitMQ · Search" accent />

          <Node x={520} y={340} w={130} title="Image service" sub="WebP · AVIF" />
          <Node x={700} y={340} w={130} title="Uploads" sub="nginx · NFS" />
          <Node x={870} y={340} w={150} title="Workers" sub="Queues · GPU renders" accent />

          <Arrow d="M140 238 H168" />
          <Arrow d="M300 238 H348" />
          <Arrow d="M480 215 C 500 215, 495 98, 518 98" />
          <Arrow d="M480 238 H518" />
          <Arrow d="M415 276 V450 H765 V418" />
          <Arrow d="M650 98 H698" />
          <Arrow d="M650 238 H698" />
          <Arrow d="M585 276 V338" />
          <Arrow d="M945 340 V278" />
          <Arrow d="M620 200 C 620 160, 800 175, 868 112" dashed />

          <text x="425" y="438" textAnchor="middle" fontSize="12" className="fill-fg-3">
            /uploads
          </text>

          <g>
            <rect x="10" y="494" width="1020" height="34" rx="12" className="fill-subtle" />
            <text x="520" y="516" textAnchor="middle" fontSize="13" className="fill-fg-2">
              Deployed with Helm · Autoscaling, disruption budgets, three node data tier · Nightly database backups
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="text-fg-3 mt-3 text-[0.8125rem]">
        Solid arrows are request paths; the dashed arrow is telemetry. Pages go through the cache, but API calls skip the frontend completely so big
        uploads never pass through it.
      </figcaption>
    </figure>
  );
}
