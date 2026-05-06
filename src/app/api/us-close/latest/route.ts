import { NextResponse } from "next/server";
import { getUsCloseFromApi } from "@/lib/usCloseApi";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getUsCloseFromApi();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
