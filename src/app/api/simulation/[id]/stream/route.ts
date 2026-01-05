// Next.js API route to proxy SSE stream with authentication
// EventSource doesn't support custom headers, so we proxy through this route
// and add the Authorization header server-side

import { NextRequest } from "next/server";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { env } from "@/lib/env";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const runId = params.id;
    
    // Get Firebase ID token from the request (passed via query param or cookie)
    // For server-side requests, we need to get the token from the client
    const token = req.nextUrl.searchParams.get("token");
    
    if (!token) {
      return new Response("Missing authentication token", { status: 401 });
    }

    // Build the backend SSE endpoint URL
    const backendUrl = `${env.NEXT_PUBLIC_BACKEND_BASE}/api/v1/simulation/runs/${runId}/stream`;
    
    // Forward the request to the backend with Authorization header
    const backendResponse = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    if (!backendResponse.ok) {
      return new Response(
        `Backend error: ${backendResponse.statusText}`,
        { status: backendResponse.status }
      );
    }

    // Check if the response is actually an SSE stream
    const contentType = backendResponse.headers.get("content-type");
    if (!contentType?.includes("text/event-stream")) {
      return new Response("Backend did not return an SSE stream", { status: 500 });
    }

    // Create a readable stream to forward the SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            // Forward the chunk to the client
            controller.enqueue(value);
          }
        } catch (error) {
          console.error("[SSE Proxy] Error forwarding stream:", error);
          controller.error(error);
        }
      },
    });

    // Return the stream with appropriate headers
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable buffering for nginx proxies
      },
    });
  } catch (error) {
    console.error("[SSE Proxy] Error:", error);
    return new Response(
      `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
}

// Use Node.js runtime for SSE streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

