'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Usage {
  count: number
  limit: number
  tier: string
}

export function UsageIndicator({ refreshTrigger }: { refreshTrigger: number }) {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.json())
      .then(setUsage)
  }, [refreshTrigger])

  if (!usage) return null

  const percent = Math.min((usage.count / usage.limit) * 100, 100)
  const remaining = usage.limit - usage.count
  const isAlmost = percent >= 70
  const isAtLimit = percent >= 100

  return (
    <div className="px-4 py-3 border-t border-zinc-800">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-500">
          {isAtLimit
            ? 'Haha ok you\'re cooked 😵'
            : isAlmost
            ? `Only ${remaining} vibe${remaining === 1 ? '' : 's'} left 👀`
            : `${remaining} vibe${remaining === 1 ? '' : 's'} remaining`}
        </span>
        <span className="text-xs text-zinc-600">
          {usage.count}/{usage.limit}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isAtLimit
              ? 'bg-red-500'
              : isAlmost
              ? 'bg-yellow-500'
              : 'bg-emerald-500'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {usage.tier === 'free' && !isAtLimit && (
        <p className="text-xs text-zinc-700 mt-1.5">
          Resets every 5 hours · Free tier
        </p>
      )}

      {isAtLimit && (
        <p className="text-xs text-zinc-600 mt-1.5">
          Resets in a bit. Sit with the chaos for now. 🧘
        </p>
      )}
    </div>
  )
}