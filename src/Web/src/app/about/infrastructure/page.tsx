import type { Metadata } from "next";
import { Activity, Boxes, Cloud, Container, Radar, Server, ShieldCheck, Ship, type LucideIcon } from "lucide-react";
import { ArchitectureDiagram } from "@/components/pages/ArchitectureDiagram";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Built on Kubernetes",
  description: "How the GeiseIT Looking Glass runs: my own servers, Kubernetes, Helm and Prometheus, built so it can move to Amazon EKS Anywhere."
};

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Server,
    title: "My own hardware",
    body: "This runs on servers I own and operate, not rented cloud capacity."
  },
  {
    icon: Boxes,
    title: "Kubernetes",
    body: "Nothing exotic. Standard Kubernetes objects only: Deployments, Services, Ingress, ConfigMaps, autoscaling and disruption budgets."
  },
  {
    icon: Container,
    title: "Containers",
    body: "The web frontend, the API and the diagnostics worker are three separate, minimal container images."
  },
  {
    icon: Ship,
    title: "Helm",
    body: "One Helm chart describes the whole deployment, so every install is done the same repeatable way."
  },
  {
    icon: Activity,
    title: "Prometheus",
    body: "Every workload exposes metrics. I scrape them for dashboards and to keep an eye on capacity."
  },
  {
    icon: Radar,
    title: "OpenTelemetry",
    body: "The services are instrumented for tracing, and logs are structured so I can follow a request end to end without recording who made it."
  }
];

const SECURITY = [
  "Containers run as non-root, with a read-only filesystem and no extra privileges.",
  "Network policies limit each workload to the connections it needs. The diagnostics workload can reach the Internet, but not the rest of my cluster.",
  "Nothing in it needs access to the Kubernetes API.",
  "Destinations are checked before and after DNS resolution, so nobody can use it to probe private networks.",
  "Requests are rate limited, time limited and size limited."
];

export default function InfrastructurePage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Built on Kubernetes"
        description="This Looking Glass is a real production workload, not a demo. It runs on servers I own, on Kubernetes, and I built it so it could move to another Kubernetes platform without a redesign."
      />

      <Card as="section" aria-labelledby="arch" className="mb-8">
        <CardHeader titleId="arch" title="Architecture" description="How a request travels through the platform." />
        <ArchitectureDiagram />
      </Card>

      <section aria-labelledby="stack">
        <h2 id="stack" className="text-fg mb-4 text-xl font-semibold">
          What it runs on
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="card card-hover p-5">
              <span aria-hidden="true" className="bg-brand-soft text-brand-fg mb-3 grid size-10 place-items-center rounded-xl">
                <Icon className="size-5" />
              </span>
              <h3 className="text-fg text-base font-semibold">{title}</h3>
              <p className="text-fg-2 mt-1 text-sm">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="portable" className="border-brand/40">
          <CardHeader titleId="portable" title="Portable to Amazon EKS Anywhere" icon={<Cloud className="size-[1.125rem]" />} />
          <p className="text-fg-2 text-[0.9375rem]">
            I built this to be portable to Amazon EKS Anywhere. It avoids cloud-specific services and only relies on standard Kubernetes features, so the
            same Helm chart should deploy to my own cluster, to EKS Anywhere, or to any other conformant Kubernetes. I haven&apos;t run it on EKS Anywhere yet,
            so treat that as the design goal, not something I&apos;ve proven.
          </p>
        </Card>

        <Card as="section" aria-labelledby="secure">
          <CardHeader titleId="secure" title="Secure by default" icon={<ShieldCheck className="size-[1.125rem]" />} />
          <ul className="text-fg-2 marker:text-fg-3 list-disc space-y-2 pl-5 text-sm">
            {SECURITY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
