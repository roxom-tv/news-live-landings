import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { getLandingBySlug } from "@/lib/db";
import { withDiscoveredSourceImages } from "@/lib/source-images";
import AdminPage from "@/app/admin/page";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = getLandingBySlug(slug);
  if (!landing) return {};
  return {
    title: landing.content.headline,
    description: landing.content.summary,
    alternates: {
      canonical: landing.finalUrl
    }
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "admin") return <AdminPage />;
  const landing = getLandingBySlug(slug);
  if (!landing || landing.status !== "live") notFound();
  const content = await withDiscoveredSourceImages(landing.content);
  return <LandingRenderer content={content} />;
}
