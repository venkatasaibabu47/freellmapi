import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bolt, Cpu, Mic, MicOff, Radar, SendHorizonal, ShieldCheck, Sparkles } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { readChatStream } from '@/lib/playground-stream'

type Message = {
  id: number
  role: 'user' | 'assistant'
  text: string
}

const quickActions = [
  'Summarize this deployment',
  'Run a security sweep',
  'Create an update brief',
  'Check model health',
]

const starterMessages: Message[] = [
  { id: 1, role: 'assistant', text: 'Jarvis is ready. Send a message to start a conversation.' },
]

export default function JarvisPage() {
  const [messages, setMessages] = useState<Message[]>(starterMessages)
  const [input, setInput] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { data: keyData, isLoading: keyLoading, isError: keyError } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading || keyLoading) return

    const userMessage: Message = { id: Date.now(), role: 'user', text: trimmed }
    const assistantId = userMessage.id + 1
    const conversation = [...messages, userMessage]
    setMessages([...conversation, { id: assistantId, role: 'assistant', text: '' }])
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (keyData?.apiKey) headers.Authorization = `Bearer ${keyData.apiKey}`
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: conversation.map(({ role, text }) => ({ role, content: text })),
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } | string } | null
        const message = typeof body?.error === 'string' ? body.error : body?.error?.message
        throw new Error(message || `Request failed (HTTP ${response.status})`)
      }

      if (!response.body) throw new Error('The API returned an empty response.')

      const contentType = response.headers.get('Content-Type') ?? ''
      if (contentType.includes('text/event-stream')) {
        let answer = ''
        const result = await readChatStream(response.body, {
          onDelta: (delta) => {
            answer += delta
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, text: answer } : message,
            ))
          },
        })
        if (result.error) throw new Error(result.error)
        if (!answer.trim()) throw new Error('The API completed without returning a response.')
      } else {
        const body = await response.json() as {
          choices?: { message?: { content?: unknown } }[]
        }
        const answer = body.choices?.[0]?.message?.content
        if (typeof answer !== 'string' || !answer.trim()) {
          throw new Error('The API returned no assistant message.')
        }
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, text: answer } : message,
        ))
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      setMessages((current) => current.map((item) =>
        item.id === assistantId ? { ...item, text: `Request failed: ${message}` } : item,
      ))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const statusCards = [
    {
      title: 'Chat API',
      value: keyLoading ? 'Checking' : keyError ? 'Unavailable' : keyData?.apiKey ? 'Ready' : 'No API key',
      accent: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/40',
    },
    {
      title: 'Model route',
      value: 'Automatic',
      accent: 'bg-violet-500/15 text-violet-200 ring-violet-400/40',
    },
    {
      title: 'Assistant',
      value: loading ? 'Responding' : 'Ready',
      accent: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40',
    },
  ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.18),_transparent_25%),hsl(var(--background))]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-background/70 p-4 shadow-[0_0_30px_rgba(34,211,238,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.34em] text-cyan-400/80">Mission Control</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">JARVIS Console</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
              <span className={`size-2 rounded-full ${keyData?.apiKey && !keyError ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {keyLoading ? 'Checking API' : keyError ? 'API unavailable' : keyData?.apiKey ? 'API connected' : 'API key missing'}
            </div>
            <button
              type="button"
              onClick={() => setVoiceEnabled((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:border-cyan-400/50 hover:text-cyan-200"
              aria-pressed={voiceEnabled}
            >
              {voiceEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {voiceEnabled ? 'Voice live' : 'Voice off'}
            </button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_240px]">
          <aside className="space-y-4 rounded-3xl border border-border/80 bg-card/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Overview</p>
              <Sparkles className="size-4 text-cyan-400" />
            </div>
            <div className="space-y-3">
              {statusCards.map((card) => (
                <div key={card.title} className={`rounded-2xl border border-border/60 p-3 ring-1 ${card.accent}`}>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-75">{card.title}</p>
                  <p className="mt-2 text-lg font-semibold">{card.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3">
              <div className="flex items-center gap-2 text-cyan-200">
                <ShieldCheck className="size-4" />
                <span className="text-sm font-medium">Request routing</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Messages are sent to the configured chat API with automatic model routing.
              </p>
            </div>
          </aside>

          <main className="rounded-3xl border border-border/80 bg-card/70 p-4 shadow-[0_0_30px_rgba(168,85,247,0.08)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Cpu className="size-4 text-cyan-400" />
                Assistant
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                <Radar className="size-3.5 text-violet-300" />
                Chat API
              </div>
            </div>

            <div className="max-h-[450px] space-y-4 overflow-y-auto pr-1" aria-live="polite">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed ${
                      message.role === 'user'
                        ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-50'
                        : 'border-border/60 bg-background/50 text-foreground'
                    }`}
                  >
                    {message.text || (loading && message.role === 'assistant' ? 'Thinking…' : '')}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setInput(action)}
                  disabled={loading}
                  className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-cyan-400/50 hover:text-foreground disabled:opacity-50"
                >
                  {action}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-4 rounded-2xl border border-border/80 bg-background/50 p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVoiceEnabled((current) => !current)}
                  className={`inline-flex size-10 items-center justify-center rounded-xl border ${
                    voiceEnabled ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : 'border-border bg-card text-muted-foreground'
                  }`}
                  aria-label="Toggle voice"
                  aria-pressed={voiceEnabled}
                >
                  {voiceEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                </button>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask Jarvis a question..."
                  aria-label="Message Jarvis"
                  className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || keyLoading || !input.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                  <SendHorizonal className="size-4" />
                </button>
              </div>
            </form>
          </main>

          <aside className="space-y-4 rounded-3xl border border-border/80 bg-card/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">API details</p>
              <Bolt className="size-4 text-amber-300" />
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/60 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Endpoint</p>
                <code className="mt-2 block break-all text-xs text-foreground">/v1/chat/completions</code>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Response mode</p>
                <p className="mt-2 text-sm font-medium text-foreground">Token streaming</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Model routing</p>
                <p className="mt-2 text-sm font-medium text-foreground">Automatic</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
