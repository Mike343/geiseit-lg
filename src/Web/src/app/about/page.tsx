import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Cpu, Handshake, LockKeyhole, Scale, Wrench } from "lucide-react";
import { DiagnosticCard } from "@/components/diagnostics/DiagnosticCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = {
  title: "About GeiseIT",
  description: "What a Looking Glass is, why I run one, how results are generated, and how to use it responsibly."
};

const diagnostics = NAV_ITEMS.filter((item) => item.href.startsWith("/diagnostics/"));

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="About GeiseIT"
        description="A public window into my network: run real diagnostics from GeiseIT's infrastructure and see how it reaches the rest of the Internet."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="what">
          <CardHeader titleId="what" title="What is a Looking Glass?" icon={<BookOpen className="size-[1.125rem]" />} />
          <div className="text-fg-2 space-y-3 text-[0.9375rem]">
            <p>
              A Looking Glass is a public tool that lets anyone run network diagnostics from the point of view of a network operator. Instead of testing from
              your own connection, you ask my network to reach a destination and tell you what it sees.
            </p>
            <p>
              It&apos;s handy for checking whether a service is reachable from somewhere else, comparing IPv4 and IPv6 paths, and figuring out where a slow or
              broken route goes wrong.
            </p>
          </div>
        </Card>

        <Card as="section" aria-labelledby="why">
          <CardHeader titleId="why" title="Why I run one" icon={<Handshake className="size-[1.125rem]" />} />
          <div className="text-fg-2 space-y-3 text-[0.9375rem]">
            <p>
              I like being open about how my network performs. It shows customers and peers what to expect, and it gives anyone a way to troubleshoot
              connectivity to and from GeiseIT.
            </p>
            <p>
              It&apos;s also a real production workload running on my own Kubernetes cluster. See{" "}
              <Link href="/about/infrastructure" className="text-brand-fg font-medium underline-offset-2 hover:underline">
                how it&apos;s built
              </Link>
              .
            </p>
          </div>
        </Card>
      </div>

      <section aria-labelledby="available" className="mt-10">
        <h2 id="available" className="text-fg mb-4 text-xl font-semibold">
          Available diagnostics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {diagnostics.map((item) => (
            <DiagnosticCard key={item.href} item={item} />
          ))}
        </div>
        <p className="text-fg-3 mt-3 text-sm">
          Read-only BGP views (routes, prefix and ASN lookups, session status) will show up once I enable a BGP data source for this Looking Glass.
        </p>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card as="section" aria-labelledby="how">
          <CardHeader titleId="how" title="How results are generated" icon={<Cpu className="size-[1.125rem]" />} />
          <div className="text-fg-2 space-y-3 text-sm">
            <p>
              When you run a test, the request goes to my API, which checks the destination and hands it to an isolated diagnostics service. That service
              runs standard network tools with fixed arguments and strict time and output limits, and returns structured results.
            </p>
            <p>
              Every result has a <strong className="text-fg">Summary</strong> for quick reading and a <strong className="text-fg">Technical</strong> view with
              the full output. If a result ever comes from simulated data, it says so clearly.
            </p>
          </div>
        </Card>

        <Card as="section" aria-labelledby="privacy">
          <CardHeader titleId="privacy" title="Privacy" icon={<LockKeyhole className="size-[1.125rem]" />} />
          <div className="text-fg-2 space-y-3 text-sm">
            <p>
              There&apos;s no sign-in and no tracking cookies. The only thing stored in your browser is your theme preference.
            </p>
            <p>
              To run and protect the service I use your IP address for rate limiting, and my logs only keep a hashed version that changes every day. Recent
              activity on the dashboard is anonymous, and internal network addresses on a route are hidden and shown as &ldquo;Internal network&rdquo;.
            </p>
          </div>
        </Card>

        <Card as="section" aria-labelledby="use">
          <CardHeader titleId="use" title="Acceptable use" icon={<Scale className="size-[1.125rem]" />} />
          <ul className="text-fg-2 list-disc space-y-2 pl-5 text-sm marker:text-fg-3">
            <li>Test only destinations you own or are permitted to test.</li>
            <li>Don&apos;t use this tool to flood, scan or attack any host or network.</li>
            <li>Private, loopback and reserved addresses are blocked by design.</li>
            <li>Requests are rate limited. Automated or excessive use may be blocked.</li>
          </ul>
        </Card>
      </div>

      <Card className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="bg-brand-soft text-brand-fg grid size-10 place-items-center rounded-xl">
            <Wrench className="size-5" />
          </span>
          <div>
            <p className="text-fg font-semibold">Curious how it runs?</p>
            <p className="text-fg-2 text-sm">This Looking Glass is a Kubernetes-native workload on hardware I own.</p>
          </div>
        </div>
        <Link href="/about/infrastructure" className="btn btn-primary">
          Built on Kubernetes
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Card>
    </>
  );
}
