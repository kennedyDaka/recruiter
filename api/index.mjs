import server from "../dist/server/server.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
  includeFiles: ["../dist/**/*"],
};

export default async function handler(req, res) {
  try {
    // Vercel rewrites change the URL. Use x-matched-path to recover the original.
    const originalPath = req.headers["x-matched-path"] || req.url;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "localhost";
    const url = new URL(originalPath, `${proto}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }

    const init = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      init.body = Buffer.concat(chunks);
    }

    const request = new Request(url.toString(), init);
    const response = await server.fetch(request, process.env, {});

    res.status(response.status || 200);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = await response.text();
    res.send(body);
  } catch (error) {
    console.error("Server error:", error.message, error.stack);
    res.status(500);
    res.json({ error: error.message || "Internal Server Error" });
  }
}
