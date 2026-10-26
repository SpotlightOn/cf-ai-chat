export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
}

interface ImageGenerateRequest {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  num_steps?: number;
}

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

const ALLOWED_MODELS = [
  { id: "@cf/zai-org/glm-4.7-flash", name: "GLM 4.7 Flash", type: "text" },
  { id: "@cf/meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", type: "text" },
  { id: "@cf/meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B Instruct", type: "text" },
  { id: "@cf/qwen/qwen1.5-14b-chat-awq", name: "Qwen 1.5 14B Chat", type: "text" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.1", name: "Mistral 7B Instruct", type: "text" },
  { id: "@cf/black-forest-labs/flux-1-schnell", name: "Flux 1 Schnell (Image)", type: "image" },
  { id: "@cf/bytedance/stable-diffusion-xl-lightning", name: "Stable Diffusion XL Lightning (Image)", type: "image" },
  { id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", name: "Stable Diffusion XL Base 1.0 (Image)", type: "image" },
];

const SYSTEM_PROMPT =
  "You are a helpful and friendly AI assistant. Answer clearly and concisely. Respond in the same language the user writes in unless they explicitly ask otherwise.";

function isAllowedModel(modelId: string): boolean {
  return ALLOWED_MODELS.some((m) => m.id === modelId);
}

function getModel(modelId?: string): string {
  if (modelId && isAllowedModel(modelId)) {
    return modelId;
  }
  return DEFAULT_MODEL;
}

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Cloudflare AI Chat"',
      "Content-Type": "text/plain",
    },
  });
}

function checkBasicAuth(request: Request): Response | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  const base64 = authHeader.slice("Basic ".length);
  let decoded: string;
  try {
    decoded = atob(base64);
  } catch {
    return unauthorized();
  }

  if (decoded !== "admin:admin") {
    return unauthorized();
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for API routes
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Basic Auth
    const authError = checkBasicAuth(request);
    if (authError) {
      return authError;
    }

    // API route for chat
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const res = await handleChat(request, env);
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // API route for image generation
    if (url.pathname === "/api/image" && request.method === "POST") {
      const res = await handleImage(request, env);
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // List available models
    if (url.pathname === "/api/models" && request.method === "GET") {
      const res = Response.json({
        models: ALLOWED_MODELS,
        defaultModel: DEFAULT_MODEL,
      });
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // Health check
    if (url.pathname === "/api/health") {
      const res = Response.json({
        status: "ok",
        defaultModel: DEFAULT_MODEL,
        models: ALLOWED_MODELS.length,
      });
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // Serve static assets (SPA)
    return env.ASSETS.fetch(request);
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Validate messages
    for (const msg of body.messages) {
      if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
        return Response.json({ error: "Invalid message role" }, { status: 400 });
      }
      if (typeof msg.content !== "string") {
        return Response.json({ error: "Message content must be a string" }, { status: 400 });
      }
    }

    const model = getModel(body.model);
    const modelConfig = ALLOWED_MODELS.find((m) => m.id === model);

    // Image models don't support chat completions
    if (modelConfig?.type === "image") {
      return Response.json(
        { error: "Selected model is for image generation. Use /api/image endpoint." },
        { status: 400 }
      );
    }

    // Keep only last 20 messages to stay within context limits
    const recentMessages = body.messages.slice(-20);

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...recentMessages,
    ];

    const result = await env.AI.run(model, {
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });

    const raw = result as {
      response?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = raw.response || raw.choices?.[0]?.message?.content || "";

    return Response.json({ reply, model });

  } catch (err) {
    console.error("Chat error:", err);
    return Response.json({ error: "An error occurred while processing your request" }, { status: 500 });
  }
}

async function handleImage(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as ImageGenerateRequest;

    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const model = getModel(body.model);
    const modelConfig = ALLOWED_MODELS.find((m) => m.id === model);

    if (modelConfig?.type !== "image") {
      return Response.json(
        { error: "Selected model does not support image generation" },
        { status: 400 }
      );
    }

    const result = await env.AI.run(model, {
      prompt: body.prompt.trim(),
      ...(body.width && { width: body.width }),
      ...(body.height && { height: body.height }),
      ...(body.num_steps && { num_steps: body.num_steps }),
    });

    // Workers AI image models typically return binary image data or base64
    if (result instanceof ReadableStream) {
      return new Response(result, {
        headers: { "Content-Type": "image/png" },
      });
    }

    // Some models return base64 or object with image
    const raw = result as any;
    if (raw.image) {
      // Could be base64
      if (typeof raw.image === "string") {
        const imageData = raw.image.startsWith("data:")
          ? raw.image.split(",")[1]
          : raw.image;
        const binary = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
        return new Response(binary, {
          headers: { "Content-Type": "image/png" },
        });
      }
    }

    if (raw.images && Array.isArray(raw.images) && raw.images[0]) {
      const img = raw.images[0];
      if (typeof img === "string") {
        const imageData = img.startsWith("data:") ? img.split(",")[1] : img;
        const binary = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
        return new Response(binary, {
          headers: { "Content-Type": "image/png" },
        });
      }
    }

    // If it's an object with response containing image
    return Response.json({ result: raw }, { status: 200 });

  } catch (err) {
    console.error("Image generation error:", err);
    return Response.json({ error: "An error occurred while generating the image" }, { status: 500 });
  }
}
