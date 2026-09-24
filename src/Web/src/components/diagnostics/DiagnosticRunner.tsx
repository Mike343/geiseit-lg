"use client";

import { Card } from "@/components/ui/Card";
import { useDiagnostic } from "@/hooks/useDiagnostic";
import type { DiagnosticKind } from "@/lib/api/types";
import { DiagnosticForm } from "./DiagnosticForm";
import { ResultArea } from "./ResultArea";

export function DiagnosticRunner({ kind }: { kind: DiagnosticKind }) {
  const diag = useDiagnostic();
  const serverRejected = diag.status === "error" && (diag.error?.code === "validation_failed" || diag.error?.code === "destination_blocked");

  return (
    <div className="space-y-6">
      <Card>
        <DiagnosticForm
          kind={kind}
          running={diag.running}
          cooldownSeconds={diag.cooldownSeconds}
          serverRejected={serverRejected}
          onSubmit={(k, request) => void diag.run(k, request)}
          onCancel={diag.cancel}
        />
      </Card>
      <ResultArea diag={diag} />
    </div>
  );
}
