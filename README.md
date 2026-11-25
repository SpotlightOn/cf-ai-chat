# Cloudflare AI Chat

A simple chat application with **Cloudflare Workers** + **Workers AI** and a React frontend (Vite). Supports multiple text and image generation models.

## Features

- 💬 Modern chat UI with auto-resizing input, message history, and loading states
- 🤖 Dynamic model list loaded from the Cloudflare Workers AI catalog
- 🖼️ Image generation support for Text-to-Image models
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
Returns the available models and default model. The list is loaded dynamically from the Cloudflare Workers AI catalog and cached for 5 minutes.

```json
{
  "models": [
    { "id": "@cf/zai-org/glm-4.7-flash", "name": "GLM 4.7 Flash", "type": "text" },
    { "id": "@cf/black-forest-labs/flux-1-schnell", "name": "Flux 1 Schnell", "type": "image" }
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
  "models": 76
}
```

## Dynamic Models

Models are fetched from the Cloudflare account's Workers AI catalog (`Text Generation` and `Text-to-Image` tasks). Set these Worker secrets/vars so the Worker can read the catalog:

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

The API token needs Workers AI read access. If these values are missing or the catalog request fails, the Worker falls back to a small built-in model list.

## License

MIT
