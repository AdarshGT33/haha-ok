import { currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { title } = await req.json()

  // Upsert user first
  await supabaseAdmin
    .from('users')
    .upsert({ id: user.id, email: user.emailAddresses[0].emailAddress })

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({ user_id: user.id, title: title ?? 'New Chat' })
    .select()
    .single()

  if (error) return new Response('DB error', { status: 500 })

  return Response.json(data)
}

export async function GET() {
  const user = await currentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return new Response('DB error', { status: 500 })

  return Response.json(data)
}