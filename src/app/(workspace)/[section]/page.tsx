import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionPage } from "@/components/workspace/section-page";
import { validSections } from "@/lib/navigation";

type SectionPageProps = {
  params: Promise<{ section: string }>;
};

export async function generateMetadata({
  params,
}: SectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const item = validSections.find((entry) => entry.href === `/${section}`);
  return { title: item?.label ?? "Page not found" };
}

export function generateStaticParams() {
  return validSections.map((item) => ({ section: item.href.slice(1) }));
}

export default async function WorkspaceSectionRoute({
  params,
}: SectionPageProps) {
  const { section } = await params;
  if (!validSections.some((entry) => entry.href === `/${section}`)) notFound();
  return <SectionPage section={section} />;
}
