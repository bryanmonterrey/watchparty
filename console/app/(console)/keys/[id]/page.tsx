import { KeyDetailView } from "@/components/console/key-detail-view";

export default async function KeyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KeyDetailView id={id} />;
}
