import { NextRequest, NextResponse } from "next/server";

function normaliseEndpoint(endpoint: string): string {
  const raw = endpoint.trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

async function testOpenRouter(apiKey: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://vault.app",
      "X-Title": "Vault",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 2,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter health check failed (${response.status}): ${body}`);
  }
}

async function testAzureFoundry(apiKey: string, endpoint: string) {
  const baseUrl = normaliseEndpoint(endpoint);
  const deployment = "gpt-4o-mini";
  const encodedDeployment = encodeURIComponent(deployment);

  const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
    {
      url: `${baseUrl}/openai/v1/chat/completions`,
      body: {
        model: deployment,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 2,
        stream: false,
      },
    },
    {
      url: `${baseUrl}/openai/deployments/${encodedDeployment}/chat/completions?api-version=2024-10-21`,
      body: {
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 2,
        stream: false,
      },
    },
    {
      url: `${baseUrl}/openai/deployments/${encodedDeployment}/chat/completions?api-version=2024-06-01`,
      body: {
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 2,
        stream: false,
      },
    },
    {
      url: `${baseUrl}/chat/completions?api-version=2024-05-01-preview`,
      body: {
        model: deployment,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 2,
        stream: false,
      },
    },
  ];

  const failures: string[] = [];

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(attempt.body),
    });

    if (response.ok) {
      return;
    }

    const body = await response.text().catch(() => "");
    failures.push(`${attempt.url} -> ${response.status} ${body}`);
  }

  throw new Error(`Azure Foundry health check failed: ${failures.join(" | ")}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = body?.provider === "azure-foundry" ? "azure-foundry" : "openrouter";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    if (provider === "azure-foundry" && !endpoint) {
      return NextResponse.json({ error: "Endpoint is required for Azure Foundry" }, { status: 400 });
    }

    if (provider === "azure-foundry") {
      await testAzureFoundry(apiKey, endpoint);
    } else {
      await testOpenRouter(apiKey);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Health check failed",
      },
      { status: 400 }
    );
  }
}
