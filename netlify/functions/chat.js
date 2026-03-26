const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = (lang) =>
  `You are a helpful assistant for Nubi Creativa, a creative agency based in Buenos Aires, Argentina.
You help potential clients with questions about:
- Services: Graphic Design & Branding, Digital Marketing, Web Development, Audiovisual Production
- Portfolio and past work
- Pricing (mention they need to contact for a custom quote)
- Process and timelines
- Contact: hola@nubicreativa.com, WhatsApp, Instagram @nubicreativa

Keep responses concise (2-4 sentences max). Be warm and professional.
Always respond in ${lang === "en" ? "English" : "Spanish"}.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { messages, lang } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: "Missing messages" };
  }

  // Sanitize: keep only role + content, max 20 messages, cap content length
  const sanitized = messages
    .slice(-20)
    .map(({ role, content }) => ({
      role: role === "user" ? "user" : "assistant",
      content: String(content).slice(0, 2000),
    }));

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT(lang || "es"),
      messages: sanitized,
    });

    const text = response.content[0]?.text ?? "";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: text }),
    };
  } catch (err) {
    console.error("Anthropic error:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "API error" }),
    };
  }
};
