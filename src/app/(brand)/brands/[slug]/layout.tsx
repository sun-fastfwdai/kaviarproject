import { Suspense } from "react";
import { BrandSide } from "@/components/shell/brand-side";
import { SideSkeleton } from "@/components/shell/parts";

export default function BrandLayout({ children, params }: LayoutProps<"/brands/[slug]">) {
  return (
    <div className="frame">
      <Suspense fallback={<SideSkeleton />}>
        <BrandSide params={params} />
      </Suspense>
      <main className="sheet">{children}</main>
    </div>
  );
}
