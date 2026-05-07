import { NextResponse } from "next/server";
import { getALiveQuotes } from "@/lib/aLiveApi";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getALiveQuotes();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
