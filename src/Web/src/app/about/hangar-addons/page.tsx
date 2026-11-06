import type { Metadata } from "next";
import { Activity, ArrowRight, Boxes, Cloud, DatabaseZap, Download, Gauge, HardDrive, ListChecks, Server, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { HangarAddonsDiagram } from "@/components/pages/HangarAddonsDiagram";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Hangar Addons infrastructure",
  description: "How Hangar Addons runs: my own servers, Kubernetes, a three node data tier, background workers and a GPU, watched with Prometheus, Loki and Tempo."
};

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Server,
    title: "My own hardware",
    body: "Five servers I own and run. One is the control plane, three run the apps and the databases, and one holds the shared storage and the graphics card."
  },
  {
    icon: Cloud,
    title: "Cloudflare in front",
    body: "Cloudflare caches images and absorbs junk traffic. Tunnel connectors running inside the cluster carry real requests in."
  },
  {
    icon: Boxes,
    title: "Kubernetes and Helm",
    body: "Every piece is its own Helm chart in one namespace, behind ingress nginx with Let's Encrypt certificates. A deploy builds the images, then rolls them out one pod at a time."
  },
  {
    icon: Gauge,
    title: "Fast pages",
    body: "Pages for signed out visitors come from an nginx cache that holds each page for 30 seconds, and it is cleared the moment an addon changes. Signed in pages always go to the app."
  },
  {
    icon: HardDrive,
    title: "Uploads and images",
    body: "Files live on a shared NFS volume. A small nginx service hands out images read only, and a separate image service makes the WebP and AVIF sizes so a big upload can never knock over the API."
  },
  {
    icon: DatabaseZap,
    title: "A real data tier",
    body: "PostgreSQL (CloudNativePG), Redis with Sentinel, RabbitMQ and Elasticsearch each run three copies on three different servers, on local disks, so losing one machine does not lose the site."
  },
  {
    icon: ListChecks,
    title: "Background workers",
    body: "Notifications, search indexing, GitHub syncing and livery rendering all run as separate workers reading from RabbitMQ queues. Liveries are rendered with Blender on the GPU."
  },
  {
    icon: Activity,
    title: "Metrics, logs and traces",
    body: "Prometheus and Grafana for metrics and alerts, Loki for logs and Tempo for traces. The API, the workers and the frontend are all instrumented with OpenTelemetry."
  },
  {
    icon: Download,
    title: "Desktop app updates",
    body: "The Windows manager app updates itself from a feed served by the site, and the same API serves the app and the website."
  }
];

const SCALING: { name: string; range: string }[] = [
  { name: "API", range: "4 to 16 pods" },
  { name: "Frontend", range: "4 to 16 pods" },
  { name: "Page cache", range: "3 to 12 pods" },
  { name: "Uploads server", range: "3 to 10 pods" },
  { name: "Image service", range: "2 to 6 pods" }
];

const RESILIENCE = [
  "Rollouts never take a pod away before its replacement is ready, and every pod gets a short pause to finish in flight requests.",
  "Disruption budgets keep at least two pods of each busy service running while I drain or reboot a server.",
  "The databases, queue, cache and search each need a majority of their three copies, so any one server can go down and the site stays up.",
  "The database writes to a second copy before it confirms, and a full dump is taken every night and kept for 14 days.",
  "Health checks tell Kubernetes when to stop sending traffic to a pod and when to restart it."
];

const LIMITS = [
  "All uploads sit on one NFS server. It is fast and simple, but it is a single machine.",
  "Nightly database dumps are stored on one server's disk, not off site yet.",
  "Live chat connections stick to one API pod, because there is no shared backplane for them yet."
];

export default function HangarAddonsInfrastructurePage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="How Hangar Addons runs"
        description="Hangar Addons is the flight simulator addon site I run for MSFS and X-Plane pilots. It lives on the same Kubernetes cluster and hardware as this Looking Glass, so here is how it is put together."
      />

      <Card as="section" aria-labelledby="hangar-arch" className="mb-8">
        <CardHeader titleId="hangar-arch" title="Architecture" description="How a request travels through hangaraddons.com." />
        <HangarAddonsDiagram />
      </Card>

      <section aria-labelledby="hangar-stack">
        <h2 id="hangar-stack" className="text-fg mb-4 text-xl font-semibold">
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
        <Card as="section" aria-labelledby="hangar-scale">
          <CardHeader titleId="hangar-scale" title="Scales with traffic" icon={<Gauge className="size-[1.125rem]" />} />
          <p className="text-fg-2 mb-4 text-[0.9375rem]">
            The busy parts add and remove pods on their own as CPU load changes. The workers stay at a fixed size because they only pull jobs from a queue.
          </p>
          <dl className="divide-line divide-y text-sm">
            {SCALING.map(({ name, range }) => (
              <div key={name} className="flex items-center justify-between py-2">
                <dt className="text-fg-2">{name}</dt>
                <dd className="text-fg font-medium">{range}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card as="section" aria-labelledby="hangar-resilience">
          <CardHeader titleId="hangar-resilience" title="Built to stay up" icon={<ShieldCheck className="size-[1.125rem]" />} />
          <ul className="text-fg-2 marker:text-fg-3 list-disc space-y-2 pl-5 text-sm">
            {RESILIENCE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card as="section" aria-labelledby="hangar-limits" className="mt-6">
        <CardHeader titleId="hangar-limits" title="What I would still improve" icon={<TriangleAlert className="size-[1.125rem]" />} />
        <ul className="text-fg-2 marker:text-fg-3 list-disc space-y-2 pl-5 text-sm">
          {LIMITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="hangar-visit" className="border-brand/40 mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="hangar-visit" className="text-fg font-semibold">
            See it running
          </h2>
          <p className="text-fg-2 text-sm">Hangar Addons is free to use for MSFS 2020, MSFS 2024 and X-Plane.</p>
        </div>
        <a href="https://hangaraddons.com" className="btn btn-primary" rel="noopener">
          Visit Hangar Addons
          <ArrowRight aria-hidden="true" className="size-4" />
        </a>
      </Card>
    </>
  );
}
