// Next.js API route to proxy SSE stream with authentication
// EventSource doesn't support custom headers, so we proxy through this route
// and add the Authorization header server-side

import { NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const runId = params.id;
    
    // Get Firebase ID token from the request (passed via query param)
    const token = req.nextUrl.searchParams.get("token");
    
    if (!token) {
      return new Response("Missing authentication token", { status: 401 });
    }

    // Build the backend SSE endpoint URL
    // Backend endpoint: GET /api/v1/simulation/runs/{id}/events
    const backendUrl = `${env.NEXT_PUBLIC_BACKEND_BASE}/api/v1/simulation/runs/${runId}/events`;
    
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

        let isClosed = false;
        let readerCancelled = false;
        
        // Helper function to safely close the controller
        const safeClose = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch (err) {
              // Controller might already be closed, ignore
            }
          }
        };

        // Helper function to safely enqueue data
        const safeEnqueue = (value: Uint8Array): boolean => {
          if (isClosed) {
            return false;
          }
          try {
            controller.enqueue(value);
            return true;
          } catch (err: any) {
            // Controller might be closed (client disconnected)
            // Check if it's the specific "already closed" error
            if (err?.name === 'InvalidStateError' || err?.code === 'ERR_INVALID_STATE' || err?.message?.includes('closed')) {
              if (process.env.NODE_ENV === "development") {
                console.log("[SSE Proxy] Controller already closed (client disconnected)");
              }
              isClosed = true;
              return false;
            }
            // Re-throw unexpected errors
            throw err;
          }
        };

        // Cancel the backend reader if client disconnects
        const cancelReader = async () => {
          if (!readerCancelled) {
            readerCancelled = true;
            try {
              await reader.cancel();
            } catch (err) {
              // Reader might already be cancelled, ignore
            }
          }
        };

        try {
          let chunkCount = 0;
          let lastChunkTime = Date.now();
          const streamStartTime = Date.now();
          
          console.log(`[SSE Proxy] Starting to forward stream for run ${runId}`);
          
          while (true) {
            // Check if controller is closed before reading
            if (isClosed) {
              await cancelReader();
              break;
            }

            let readResult;
            try {
              readResult = await reader.read();
            } catch (readError: any) {
              // Reader might be cancelled or closed
              if (readError?.name === 'AbortError' || readError?.name === 'TypeError') {
                console.log(`[SSE Proxy] Reader cancelled or closed after ${chunkCount} chunks`);
                isClosed = true;
                break;
              }
              throw readError;
            }

            const { done, value } = readResult;
            
            if (done) {
              const duration = Date.now() - streamStartTime;
              console.log(`[SSE Proxy] Stream ended after ${chunkCount} chunks, ${duration}ms`);
              safeClose();
              break;
            }

            chunkCount++;
            const timeSinceLastChunk = Date.now() - lastChunkTime;
            lastChunkTime = Date.now();
            
            // Decode chunk for logging (but don't modify the original value)
            const chunkText = decoder.decode(value, { stream: true });
            
            // Log all chunks in development to debug
            if (process.env.NODE_ENV === "development") {
              // Only log first 300 chars to avoid console spam
              const preview = chunkText.length > 300 ? chunkText.substring(0, 300) + "..." : chunkText;
              console.log(`[SSE Proxy] Chunk #${chunkCount} (${value.length} bytes, +${timeSinceLastChunk}ms):`, preview);
              
              // Also log if we see event types in the chunk
              const eventMatches = chunkText.match(/event: (\w+)/g);
              if (eventMatches) {
                console.log(`[SSE Proxy] ✓ Event types found:`, eventMatches.map(m => m.replace('event: ', '')));
              }
            }

            // Forward the chunk to the client immediately (no buffering)
            // If enqueue fails (client disconnected), cancel reader and stop the loop
            if (!safeEnqueue(value)) {
              console.log(`[SSE Proxy] Stopping stream forward after ${chunkCount} chunks (client disconnected)`);
              await cancelReader();
              break;
            }
          }
        } catch (error) {
          console.error("[SSE Proxy] Error forwarding stream:", error);
          if (!isClosed) {
            try {
              controller.error(error);
            } catch (err) {
              // Controller might already be closed, ignore
            }
            isClosed = true;
          }
          await cancelReader();
        } finally {
          // Clean up the reader
          if (!readerCancelled) {
            try {
              await reader.cancel();
            } catch (err) {
              // Reader might already be cancelled/released, ignore
            }
          }
          try {
            reader.releaseLock();
          } catch (err) {
            // Reader might already be released, ignore
          }
        }
      },
      cancel() {
        // Called when the client cancels the stream (disconnects)
        console.log(`[SSE Proxy] Stream cancelled by client for run ${runId}`);
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


