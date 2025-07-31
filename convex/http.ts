import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

// Add auth routes
auth.addHttpRoutes(http);

// Health check endpoint for connection testing
http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => {
    // Simple health check - return 200 OK
    // HEAD requests are automatically handled by Convex (GET with body stripped)
    return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }),
});

export default http;
