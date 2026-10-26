# Cloudflare AI Chat

A simple chat application with **Cloudflare Workers** + **Workers AI** and a React frontend (Vite). Now supports multiple models including text and image generation models.

## Features

- 💬 Modern chat UI with auto-resizing input, message history, and loading states
- 🤖 Multi-model support - switch between different AI models on the fly
- 🖼️ Image generation support with models like Flux and Stable Diffusion
- 🌐 Deploy to Cloudflare Workers (single Worker serves frontend + API)
- 🔥 Vite + React + TypeScript + Cloudflare Vite Plugin
- 💾 Model selection persisted in localStorage

## Prerequisites

- Node.js 18+
- Cloudflare Account
- Wrangler CLI (installed as dev dependency)

## Installation

```bash
cd cloudflare-ai-chat
npm install
```

## Local Development

```bash
npm run dev
```

Open http://localhost:5173

> **Note:** For AI functionality, you need to be logged into your Cloudflare account (`npx wrangler login`). Locally, the AI binding is provided by the Cloudflare runtime.

## Build & Deploy

```bash
# Build
npm run build

# Deploy
npm run deploy
# or
npx wrangler deploy
```

## Project Structure

```
cloudflare-ai-chat/
├── index.html
├── package.json
├── vite.config.ts
├── wrangler.jsonc          # Worker config + AI binding
├── worker/
│   └── index.ts            # Backend: /api/chat, /api/image, /api/models, /api/health
└── src/
    ├── main.tsx
    ├── App.tsx             # React chat UI with model selector
    ├── App.css
    └── index.css
```

## API

### `GET /api/models`
Returns available models and default model.

```json
{
  "models": [
    { "id": "@cf/zai-org/glm-4.7-flash", "name": "GLM 4.7 Flash", "type": "text" },
    { "id": "@cf/black-forest-labs/flux-1-schnell", "name": "Flux 1 Schnell (Image)", "type": "image" }
  ],
  "defaultModel": "@cf/zai-org/glm-4.7-flash"
}
```

### `POST /api/chat`
For text generation models.

Request body:
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "model": "@cf/meta/llama-3.1-8b-instruct" // optional
}
```

Response:
```json
{
  "reply": "Hello! How can I help you?",
  "model": "@cf/meta/llama-3.1-8b-instruct"
}
```

### `POST /api/image`
For image generation models.

Request body:
```json
{
  "prompt": "A cat sitting on a rocket",
  "model": "@cf/black-forest-labs/flux-1-schnell", // optional
  "width": 512,
  "height": 512
}
```

Response: Returns image binary with `Content-Type: image/png`

### `GET /api/health`
```json
{
  "status": "ok",
  "defaultModel": "@cf/zai-org/glm-4.7-flash",
  "models": 8
}
```

## Available Models

**Text Models:**
- `@cf/zai-org/glm-4.7-flash` (default)
- `@cf/meta/llama-3.1-8b-instruct`
- `@cf/meta/llama-3.2-3b-instruct`
- `@cf/qwen/qwen1.5-14b-chat-awq`
- `@cf/mistral/mistral-7b-instruct-v0.1`

**Image Models:**
- `@cf/black-forest-labs/flux-1-schnell`
- `@cf/bytedance/stable-diffusion-xl-lightning`
- `@cf/stabilityai/stable-diffusion-xl-base-1.0`

See all available models: [Cloudflare Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)

## Adding More Models

To add more models, edit the `ALLOWED_MODELS` array in `worker/index.ts`. Make sure to set the correct `type` (`"text"` or `"image"`) as this determines which endpoint to use.

## License

MIT
