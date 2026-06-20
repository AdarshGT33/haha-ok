import { currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await currentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { firstMessage } = await req.json()

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gemma2-9b-it',
      messages: [
        {
          role: 'user',
          content: `Generate a short, witty, 4-6 word chat title for this message which should be a summary of this message: "${firstMessage}". 
          Reply with ONLY the title, no quotes, no punctuation at the end, nothing else.`,
        },
      ],
      stream: false,
    }),
  })

  const data = await groqRes.json()
  const title = data.choices?.[0]?.message?.content?.trim() ?? firstMessage.slice(0, 40)

  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ title })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return new Response('DB error', { status: 500 })

  return Response.json({ title })
}