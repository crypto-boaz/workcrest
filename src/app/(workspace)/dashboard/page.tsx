import type { Metadata } from "next";

import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-7">
      <DashboardContent />
    </div>
  );
}
