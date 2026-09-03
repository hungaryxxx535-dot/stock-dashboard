import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.PORTFOLIO_CLOUD_SNAPSHOT?.trim();
  if (!token) {
    return NextResponse.json({ available: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { available: true, token },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
