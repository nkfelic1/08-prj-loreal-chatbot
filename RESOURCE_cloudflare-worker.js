// Copy this code into your Cloudflare Worker script

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      // allow common headers clients may send
      "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.OPENAI_API_KEY; // Make sure to name your secret OPENAI_API_KEY in the Cloudflare Workers dashboard
    const apiUrl = "https://api.openai.com/v1/chat/completions";
    // Read the raw body text first so we can return it on parse errors (helps debugging)
    const bodyText = await request.text();

    // If body is empty, return headers and method so we can see what the client sent
    if (!bodyText) {
      const hdrs = Object.fromEntries(
        request.headers.entries ? request.headers.entries() : []
      );
      return new Response(
        JSON.stringify({
          error: "Empty body received",
          method: request.method,
          headers: hdrs,
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    let userInput;
    try {
      userInput = JSON.parse(bodyText);
    } catch (err) {
      // Return the raw body (truncated) to help debug what the client actually sent
      const raw = bodyText
        ? bodyText.length > 1000
          ? bodyText.slice(0, 1000) + "... (truncated)"
          : bodyText
        : "";
      return new Response(JSON.stringify({ error: "Invalid JSON body", raw }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const requestBody = {
      model: "gpt-4o",
      messages: userInput.messages,
      max_tokens: userInput.max_tokens ?? 300,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), { headers: corsHeaders });
  },
};
