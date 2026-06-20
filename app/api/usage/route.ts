import { currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const user = await currentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single()

  const tier = userData?.tier ?? 'free'
  const limit = tier === 'paid' ? 30 : 10

  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()

  // Count user messages across ALL conversations in the window
  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('user_id', user.id)

  const convIds = (convs ?? []).map(c => c.id)

  let count = 0
  if (convIds.length > 0) {
    const { count: msgCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .eq('role', 'user')
      .gte('created_at', fiveHoursAgo)

    count = msgCount ?? 0
  }

  return Response.json({ count, limit, tier })
}