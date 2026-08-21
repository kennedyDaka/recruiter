import server from "../dist/server/server.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }

    const init = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      // Collect the request body
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      init.body = Buffer.concat(chunks);
    }

    const request = new Request(url.toString(), init);
    const response = await server.fetch(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Server error:", error);
    res.status(500);
    res.json({ error: "Internal Server Error" });
  }
}
