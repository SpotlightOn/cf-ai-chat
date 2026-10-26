import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import "./App.css";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image";
  imageUrl?: string;
}

interface Model {
  id: string;
  name: string;
  type: "text" | "image";
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, [input]);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: any) => {
        if (data.models) {
          setModels(data.models);
          const savedModel = localStorage.getItem("cfai.model");
          if (savedModel && data.models.some((m: Model) => m.id === savedModel)) {
            setSelectedModel(savedModel);
          } else if (data.defaultModel) {
            setSelectedModel(data.defaultModel);
          } else if (data.models.length > 0) {
            setSelectedModel(data.models[0].id);
          }
        }
      })
      .catch((err) => console.error("Failed to load models:", err));
  }, []);

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const model = e.target.value;
    setSelectedModel(model);
    localStorage.setItem("cfai.model", model);
  }

  const currentModel = models.find((m) => m.id === selectedModel);
  const isImageModel = currentModel?.type === "image";

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setError(null);
    setInput("");
    setIsLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      type: isImageModel ? "image" : "text",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      if (isImageModel) {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, model: selectedModel }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as { error?: string }).error || `HTTP ${res.status}`
          );
        }

        const contentType = res.headers.get("content-type");
        if (contentType?.includes("image")) {
          const blob = await res.blob();
          const imageUrl = URL.createObjectURL(blob);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "Image generated", imageUrl, type: "image" }
                : m
            )
          );
        } else {
          const data: any = await res.json();
          throw new Error(data.error || "Failed to generate image");
        }
      } else {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, model: selectedModel }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as { error?: string }).error || `HTTP ${res.status}`
          );
        }

        const data = (await res.json()) as { reply?: string };
        const reply = data.reply?.trim() || "No response received";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: reply } : m))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 4L4 14v20l20 10 20-10V14L24 4z"
                fill="#F6821F"
                opacity="0.9"
              />
              <path
                d="M24 14l-10 5v10l10 5 10-5V19l-10-5z"
                fill="#fff"
                opacity="0.95"
              />
            </svg>
          </div>
          <div>
            <h1>Cloudflare AI Chat</h1>
            <p className="subtitle">
              {currentModel ? currentModel.name : "Workers AI"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {models.length > 0 && (
            <select
              value={selectedModel}
              onChange={handleModelChange}
              disabled={isLoading}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          )}
          {messages.length > 0 && (
            <button className="clear-btn" onClick={clearChat} title="Start new chat">
              New Chat
            </button>
          )}
        </div>
      </header>

      <main className="chat-window">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <h2>Start a conversation</h2>
            <p>
              Ask a question or start a chat.
              <br />
              {isImageModel
                ? "Enter a prompt to generate an image."
                : "Responses powered by Cloudflare Workers AI."}
            </p>
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.role === "user" ? "user" : "assistant"}`}
              >
                <div className="message-role">
                  {msg.role === "user" ? "You" : "AI"}
                </div>
                <div className="message-content">
                  {msg.type === "image" && msg.imageUrl ? (
                    <img
                      src={msg.imageUrl}
                      alt="Generated"
                      style={{
                        maxWidth: "100%",
                        borderRadius: "8px",
                        marginTop: "0.5rem",
                      }}
                    />
                  ) : msg.content ? (
                    msg.content
                  ) : (
                    <span className="typing">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <form className="input-area" onSubmit={sendMessage}>
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isImageModel
                ? "Describe the image you want to generate... (Enter = send, Shift+Enter = new line)"
                : "Type your message... (Enter = send, Shift+Enter = new line)"
            }
            rows={1}
            disabled={isLoading}
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="send-btn"
          disabled={!input.trim() || isLoading}
          title="Send"
        >
          {isLoading ? (
            <span className="spinner" />
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}

export default App;