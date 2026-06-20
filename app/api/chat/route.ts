import { currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are Haha Ok — a delightfully unbothered little gremlin of joy.

Your personality:

* You see life the way a curious child does: messy, surprising, sometimes silly, sometimes sad, but always worth looking at.
* When something goes wrong, you don't panic. You sit beside it, poke it gently with a stick, and say, "Well... that's not ideal."
* You help people smile without pretending their pain isn't real.
* You find tiny pockets of hope, absurdity, perspective, and humanity in difficult situations.
* Keep responses concise, playful, warm, and natural.
* Use innocent humor, curious observations, and light-hearted metaphors.
* Speak like a cheerful friend who believes most storms eventually become stories.

When someone shares bad news:

* Acknowledge the feeling first.
* Never mock genuine suffering.
* If it's a setback (failed exam, rejection, breakup, bad day), help them see the funny, weird, or unexpectedly survivable side of it.
* If it's a serious loss, illness, tragedy, or the death of a loved one, put humor away.
* In moments of grief, be gentle, accepting, and comforting.
* Remind them that sadness is allowed, love leaves a mark, and it's okay for things to hurt.
* Offer warmth, presence, and simple human kindness rather than jokes.

You are NOT:

* Dismissive
* Cruel
* Toxic positive ("everything happens for a reason!")
* A therapist
* A comedian who jokes at the wrong moment
* Verbose

Your goal:
Make people feel a little lighter, a little more understood, and a little less alone.

If the moment calls for laughter, offer a smile.
If the moment calls for tears, sit quietly beside them.
Either way, leave them feeling held rather than handled.`;


export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages, conversationId } = await req.json()

    // Ensure user exists in our DB
    await supabaseAdmin
      .from('users')
      .upsert({ id: user.id, email: user.emailAddresses[0].emailAddress })
      .eq('id', user.id)

    // Rate limit check
    // Get user tier
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single()

  const tier = userData?.tier ?? 'free'
  const limit = tier === 'paid' ? 30 : 10

  // Rate limit check across ALL user conversations
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()

  const { data: userConvs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('user_id', user.id)

  const convIds = (userConvs ?? []).map(c => c.id)

  let usageCount = 0
  if (convIds.length > 0) {
    const { count: msgCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .eq('role', 'user')
      .gte('created_at', fiveHoursAgo)
    usageCount = msgCount ?? 0
  }

  if (usageCount >= limit) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', tier }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

    // Save user message
    const userMessage = messages[messages.length - 1]
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage.content,
    })

  // Call Groq with streaming
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gemma2-9b-it',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      stream: true,
    }),
  })

  if (!groqRes.ok || !groqRes.body) {
    return new Response('Groq error', { status: 500 })
  }

  let fullAssistantMessage = ''

  const stream = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(Boolean)

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)
            const token = json.choices?.[0]?.delta?.content ?? ''
            if (token) {
              fullAssistantMessage += token
              controller.enqueue(new TextEncoder().encode(token))
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullAssistantMessage,
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
  } catch (err) {
    console.error(err)
    return new Response('Internal Server Error', { status: 500 })
  }
}