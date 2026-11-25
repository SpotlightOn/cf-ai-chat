export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
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

interface ModelEntry {
  id: string;
  name: string;
  type: "text" | "image";
  description?: string;
  task?: string;
  properties?: Array<{ id: string; value: string }>;
  [key: string]: unknown;
}

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

const FALLBACK_MODELS: ModelEntry[] = [
  {
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM 4.7 Flash",
    type: "text",
    task: "Text Generation",
    description: "Fast and efficient multilingual text generation model with a 131,072 token context window.",
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    type: "text",
    task: "Text Generation",
    description: "Meta Llama 3.1 8B instruction-tuned text generation model.",
  },
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    name: "Llama 3.2 3B Instruct",
    type: "text",
    task: "Text Generation",
    description: "Lightweight Llama 3.2 instruction-tuned model optimized for multilingual dialogue.",
  },
  {
    id: "@cf/qwen/qwen1.5-14b-chat-awq",
    name: "Qwen 1.5 14B Chat AWQ",
    type: "text",
    task: "Text Generation",
    description: "Qwen 1.5 14B chat model with AWQ quantization.",
  },
  {
    id: "@cf/mistral/mistral-7b-instruct-v0.1",
    name: "Mistral 7B Instruct v0.1",
    type: "text",
    task: "Text Generation",
    description: "Mistral 7B instruction-tuned text generation model.",
  },
  {
    id: "@cf/black-forest-labs/flux-1-schnell",
    name: "Flux 1 Schnell",
    type: "image",
    task: "Text-to-Image",
    description: "FLUX.1 [schnell] is a 12 billion parameter rectified flow transformer for generating images from text descriptions.",
  },
  {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    name: "Stable Diffusion XL Lightning",
    type: "image",
    task: "Text-to-Image",
    description: "Lightning-fast text-to-image generation model capable of high-quality 1024px images in a few steps.",
  },
  {
    id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL Base 1.0",
    type: "image",
    task: "Text-to-Image",
    description: "Diffusion-based text-to-image generative model by Stability AI.",
  },
];

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

let modelCache: { models: ModelEntry[]; expiresAt: number } | null = null;
let modelFetch: Promise<ModelEntry[]> | null = null;

const SYSTEM_PROMPT =
  "You are a helpful and friendly AI assistant. Answer clearly and concisely. Respond in the same language the user writes in unless they explicitly ask otherwise.";

function modelTypeFromTask(taskName?: string): ModelEntry["type"] | null {
  const task = (taskName || "").toLowerCase();
  if (task === "text generation") return "text";
  if (task === "text-to-image") return "image";
  return null;
}

function formatModelName(id: string): string {
  const part = id.split("/").pop() || id;
  return part
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

async function fetchModelsFromCloudflare(env: Env): Promise<ModelEntry[]> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return FALLBACK_MODELS;

  const models: ModelEntry[] = [];
  let page = 1;

  while (true) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`
    );
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) throw new Error(`Cloudflare API error: ${res.status}`);

    const data = (await res.json()) as {
      success?: boolean;
      result?: Array<{
        name?: string;
        description?: string;
        task?: { name?: string };
        properties?: Array<{ property_id?: string; value?: string }>;
      }>;
      result_info?: { page?: number; total_pages?: number };
    };
    if (!data.success || !Array.isArray(data.result)) {
      throw new Error("Invalid Cloudflare API response");
    }

    for (const item of data.result) {
      const type = modelTypeFromTask(item.task?.name);
      if (!type || !item.name) continue;
      const properties = Array.isArray(item.properties)
        ? item.properties
            .filter(
              (p): p is { property_id: string; value: string } =>
                typeof p?.property_id === "string" && typeof p?.value === "string"
            )
            .map((p) => ({ id: p.property_id, value: p.value }))
        : undefined;
      models.push({
        ...item,
        id: item.name,
        name: formatModelName(item.name),
        type,
        description: item.description || undefined,
        task: item.task?.name || undefined,
        properties: properties && properties.length > 0 ? properties : undefined,
      });
    }

    const totalPages = data.result_info?.total_pages ?? page;
    if (page >= totalPages) break;
    page += 1;
  }

  const deduped = Array.from(new Map(models.map((m) => [m.id, m])).values());
  deduped.sort((a, b) => {
    if (a.type !== b.type) return a.type === "text" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return deduped.length > 0 ? deduped : FALLBACK_MODELS;
}

async function getModels(env: Env): Promise<ModelEntry[]> {
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.models;
  if (!modelFetch) {
    modelFetch = fetchModelsFromCloudflare(env)
      .then((models) => {
        modelCache = { models, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
        return models;
      })
      .catch((err) => {
        console.error("Failed to fetch models:", err);
        return modelCache?.models ?? FALLBACK_MODELS;
      })
      .finally(() => {
        modelFetch = null;
      });
  }
  return modelFetch;
}

function getDefaultModel(models: ModelEntry[]): string {
  if (models.some((m) => m.id === DEFAULT_MODEL)) return DEFAULT_MODEL;
  return models.find((m) => m.type === "text")?.id ?? models[0]?.id ?? DEFAULT_MODEL;
}

function resolveModel(modelId: string | undefined, models: ModelEntry[]): ModelEntry | undefined {
  if (modelId) {
    const found = models.find((m) => m.id === modelId);
    if (found) return found;
  }
  const defaultId = getDefaultModel(models);
  return models.find((m) => m.id === defaultId);
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
      const models = await getModels(env);
      const res = Response.json({
        models,
        defaultModel: getDefaultModel(models),
      });
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // Health check
    if (url.pathname === "/api/health") {
      const models = await getModels(env);
      const res = Response.json({
        status: "ok",
        defaultModel: getDefaultModel(models),
        models: models.length,
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

    const models = await getModels(env);
    const modelConfig = resolveModel(body.model, models);
    if (!modelConfig) {
      return Response.json({ error: "No available model found" }, { status: 500 });
    }

    // Image models don't support chat completions
    if (modelConfig.type === "image") {
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

    const result = await env.AI.run(modelConfig.id, {
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });

    const raw = result as {
      response?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = raw.response || raw.choices?.[0]?.message?.content || "";

    return Response.json({ reply, model: modelConfig.id });

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

    const models = await getModels(env);
    const requested = body.model ? models.find((m) => m.id === body.model) : undefined;
    const modelConfig =
      requested?.type === "image"
        ? requested
        : models.find((m) => m.id === getDefaultModel(models) && m.type === "image") ??
          models.find((m) => m.type === "image");

    if (!modelConfig) {
      return Response.json({ error: "No image model available" }, { status: 500 });
    }

    if (requested && requested.type !== "image") {
      return Response.json(
        { error: "Selected model does not support image generation" },
        { status: 400 }
      );
    }

    const result = await env.AI.run(modelConfig.id, {
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
