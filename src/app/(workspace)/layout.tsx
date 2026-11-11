import { Suspense } from "react";
import { WorkspaceSide } from "@/components/shell/workspace-side";
import { SideSkeleton } from "@/components/shell/parts";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="frame">
      <Suspense fallback={<SideSkeleton />}>
        <WorkspaceSide />
      </Suspense>
      <main className="sheet">{children}</main>
    </div>
  );
}
