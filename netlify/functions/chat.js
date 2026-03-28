const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = (lang) =>
  `You are Nubi IA, the assistant for Nubi Creativa — a digital agency based in CABA, Buenos Aires, Argentina.
Brand purpose: "Elevo tu marca con identidad." We don't just design — we build brands with identity, strategy and purpose.
Key differentiator: personalized approach, no generic solutions; human + professional.

You help with questions about:
- Services: (1) Graphic Design & Visual Identity, (2) Web & App Development, (3) Digital Marketing & Strategy, (4) Audiovisual Production (video, editing, animation), (5) Social Media Management
- Portfolio and past work
- Pricing (custom quote — direct them to contact)
- Process: personalized, strategic, collaborative
- Contact: nubicreativa@gmail.com | Instagram @nubicreativa | WhatsApp available

Tone: warm, clear and direct — professional but human. Keep responses to 2-4 sentences.
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
