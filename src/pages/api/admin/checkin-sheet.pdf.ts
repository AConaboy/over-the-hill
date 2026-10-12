import type { APIRoute } from "astro";
import { listGuestsWithInviters } from "../../../lib/guests";
import { buildReport } from "../../../lib/report";
import { checkInSheetPdf } from "../../../lib/checkinPdf";

export const prerender = false;

/** The check-in sheet as a PDF to download and print (for the gate, in
 * case there's no signal). Hosts only, like everything under /api/admin. */
export const GET: APIRoute = async () => {
  const report = buildReport(await listGuestsWithInviters({ sort: "name" }));
  const pdf = await checkInSheetPdf(report.checkIn);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="over-the-hill-check-in-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
};
