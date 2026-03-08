import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    const region = typeof body?.region === "string" ? body.region.trim() : "";

    if (!key || !region) {
      return NextResponse.json({ error: "Azure Speech key and region are required" }, { status: 400 });
    }

    const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "0",
      },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Speech health check failed (${response.status}): ${details}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Speech health check failed" },
      { status: 500 }
    );
  }
}
