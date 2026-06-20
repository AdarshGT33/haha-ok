import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">Haha Ok 😂</h1>
      <p className="text-zinc-400 text-lg text-center max-w-md">
        Something went wrong? Job gone? Relationship ended? Computer exploded?
        <br />
        <span className="text-zinc-200 font-medium">Haha ok. Let&apos;s vibe through it.</span>
      </p>
      <div className="flex gap-3">
        <Button  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Link href="/sign-up">Get Started</Link>
        </Button>
        <Button variant="outline" className="border-zinc-700 hover:bg-zinc-900">
          <Link href="/sign-in">Sign In</Link>
        </Button>
      </div>
    </main>
  )
}
