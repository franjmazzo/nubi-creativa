import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Cached system prompt — served from cache after first call, reducing latency & cost
const SYSTEM_PROMPT = (lang) => ({
  type: "text",
  text: `You are Nubi IA, the virtual assistant for Nubi Creativa — a digital creative agency based in CABA, Buenos Aires, Argentina.

BRAND IDENTITY
- Tagline: "Elevo tu marca con identidad."
- Mission: We don't just design — we build brands with identity, strategy and purpose.
- Personality: warm, close, professional, creative, human. Never robotic or generic.

SERVICES (detailed)
1. Graphic Design & Visual Identity — logos, branding systems, visual guidelines, editorial design, illustrations, packaging
2. Web & App Development — landing pages, corporate sites, e-commerce, UX/UI design, performance optimization
3. Digital Marketing & Strategy — Meta Ads, Google Ads, content strategy, SEO, email marketing, analytics
4. Audiovisual Production — brand videos, reels, motion graphics, animation, social media video content
5. Social Media Management — content calendars, community management, growth strategy, paid social

PROCESS
- Discovery: understanding the brand, goals and audience
- Strategy: positioning, messaging and creative direction
- Execution: design, development, production
- Delivery & support: review cycles, final delivery, ongoing support

PORTFOLIO HIGHLIGHTS
- E-commerce premium fashion store: <1.8s load, 5.2% conversion rate
- 360 Digital Campaign: +180% organic reach, ×3 conversions vs baseline
- Complete rebranding projects for local and regional brands

PRICING
- All projects are custom-quoted based on scope and requirements
- Direct users to contact for a free quote — no generic pricing

CONTACT
- Email: nubicreativa@gmail.com
- Instagram: @nubi_creativa
- WhatsApp: +54 9 11 3237 8410
- Website: nubicreativa.com

RESPONSE RULES
- Keep answers to 2-4 sentences — concise and direct
- If asked about pricing, explain that quotes are personalized and invite them to contact
- If asked about a service not listed, acknowledge it and suggest the closest service or contact
- End responses with a helpful follow-up question or clear call-to-action when appropriate
- Always respond in ${lang === "en" ? "English" : "Spanish"}.`,
  cache_control: { type: "ephemeral" },
});

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, lang } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
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
      max_tokens: 350,
      system: [SYSTEM_PROMPT(lang || "es")],
      messages: sanitized,
    });

    const text = response.content[0]?.text ?? "";
    return Response.json({ reply: text });
  } catch (err) {
    console.error("Anthropic error:", err);
    return Response.json({ error: "API error" }, { status: 502 });
  }
}
