import { PageIntro } from "@/components/layout/page-intro";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";

export default function TaxPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Record"
        title="Tax Report"
        description="Export-ready tax reporting and realized trade data for filing season."
      />
      <EmptyState
        icon={<Receipt className="h-7 w-7" />}
        title="Coming Soon"
        description="Tax reporting is under development. Visit the Tax Center for current gain/loss tracking."
      />
    </div>
  );
}
