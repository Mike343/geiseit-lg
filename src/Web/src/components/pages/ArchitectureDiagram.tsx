interface NodeProps {
  x: number;
  y: number;
  w?: number;
  h?: number;
  title: string;
  sub: string;
  accent?: boolean;
}

function Node({ x, y, w = 160, h = 76, title, sub, accent }: NodeProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="14"
        strokeWidth="1.5"
        className={accent ? "fill-brand-soft stroke-brand" : "fill-surface stroke-line-strong"}
      />
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize="15" fontWeight="600" className="fill-fg">
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 16} textAnchor="middle" fontSize="12" className="fill-fg-3">
        {sub}
      </text>
    </g>
  );
}

function Arrow({ d, dashed }: { d: string; dashed?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeDasharray={dashed ? "5 5" : undefined}
      markerEnd="url(#arrow)"
      className="stroke-fg-3"
    />
  );
}

export function ArchitectureDiagram() {
  return (
    <figure>
      <div className="scroll-x rounded-xl" tabIndex={0} role="region" aria-label="Architecture diagram, scrollable">
        <svg
          viewBox="0 0 980 440"
          role="img"
          aria-labelledby="arch-title arch-desc"
          className="mx-auto h-auto w-full min-w-[720px] max-w-4xl"
        >
          <title id="arch-title">Looking Glass architecture</title>
          <desc id="arch-desc">
            Visitors reach an ingress with TLS. The ingress routes to the web frontend and the API. The API calls a diagnostics worker, which runs tests against
            the public Internet. Prometheus and OpenTelemetry collect metrics and traces from all workloads. Everything runs on Kubernetes.
          </desc>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 9 5 1 9z" className="fill-fg-3" />
            </marker>
          </defs>

          <rect x="190" y="14" width="600" height="360" rx="22" fill="none" strokeWidth="1.5" strokeDasharray="7 6" className="stroke-brand" />
          <text x="210" y="40" fontSize="12" fontWeight="600" letterSpacing="1.4" className="fill-brand-fg">
            KUBERNETES CLUSTER · GEISEIT-OWNED SERVERS
          </text>

          <Node x={10} y={168} w={140} title="Visitors" sub="Browser" />
          <Node x={210} y={168} w={140} title="Ingress" sub="HTTPS · cert-manager" />
          <Node x={410} y={70} title="Web" sub="Next.js · static UI" />
          <Node x={410} y={266} title="API" sub="ASP.NET Core" accent />
          <Node x={610} y={266} title="Diagnostics" sub="Isolated worker" accent />
          <Node x={810} y={266} w={160} title="Public Internet" sub="Test destinations" />
          <Node x={610} y={70} title="Observability" sub="Prometheus · OpenTelemetry" w={160} />

          <Arrow d="M150 206 H208" />
          <Arrow d="M350 190 C 380 190, 380 108, 408 108" />
          <Arrow d="M350 222 C 380 222, 380 304, 408 304" />
          <Arrow d="M570 304 H608" />
          <Arrow d="M770 304 H808" />
          <Arrow d="M570 100 H608" dashed />
          <Arrow d="M490 266 C 490 200, 640 190, 690 146" dashed />

          <g>
            <rect x="10" y="396" width="960" height="34" rx="12" className="fill-subtle" />
            <text x="490" y="418" textAnchor="middle" fontSize="13" className="fill-fg-2">
              Deployed with Helm · Deployments, Services, NetworkPolicies, HPA, PDB · Portable to Amazon EKS Anywhere
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="text-fg-3 mt-3 text-[0.8125rem]">
        Solid arrows are request paths; dashed arrows are telemetry. The frontend never runs network tests itself; only the isolated diagnostics worker
        does.
      </figcaption>
    </figure>
  );
}
