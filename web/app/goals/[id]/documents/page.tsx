import { DocumentsPage } from "@/components/documents/DocumentsPage";
import { STATIC_PLACEHOLDER_ID } from "@/lib/routes";

// /goals/[id]/documents. The static export prerenders one page with a placeholder id;
// Firebase Hosting rewrites every goal's URL to it (firebase.json) and the page reads the
// real id from the URL (web/lib/route-id.ts).
export function generateStaticParams() {
  return [{ id: STATIC_PLACEHOLDER_ID }];
}

export default function Page() {
  return <DocumentsPage />;
}
