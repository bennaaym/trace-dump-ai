import { redirect } from "next/navigation";

export default async function LegacyCameraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/operations?camera=${encodeURIComponent(id)}`);
}
