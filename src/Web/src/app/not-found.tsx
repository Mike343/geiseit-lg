import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="card mx-auto mt-8 max-w-xl">
      <EmptyState
        icon={<Compass className="size-6" />}
        title="Page not found"
        description="The page you are looking for doesn't exist or has moved. Head back to the dashboard to run a diagnostic."
        action={
          <Link href="/" className="btn btn-primary">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
