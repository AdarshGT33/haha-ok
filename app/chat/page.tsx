"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { UsageIndicator } from "@/components/ui/usage-indicator";
import { PlusCircle, Send, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const { user } = useUser();
  const [usageRefreshTrigger, setUsageRefreshTrigger] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingNewChat, setPendingNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const skipNextConversationLoad = useRef(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations);
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConvId) return;

    if (skipNextConversationLoad.current) {
      skipNextConversationLoad.current = false;
      return;
    }

    setLoadingMessages(true);

    fetch(`/api/conversations/${activeConvId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data);
        setLoadingMessages(false);
      });
  }, [activeConvId]);

  // Auto scroll to bottom
  // Replace your auto-scroll useEffect with this:
  useEffect(() => {
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, isStreaming]);

  const createConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setRateLimited(false);
    setPendingNewChat(true);
    setInput("");
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const messageText = input;
    let convId = activeConvId;
    const currentMessages = messagesRef.current;

    // Create conversation on first message
    if (pendingNewChat || !convId) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: messageText.slice(0, 40) }),
      });
      const conv = await res.json();
      setConversations((prev) => [conv, ...prev]);
      skipNextConversationLoad.current = true;
      convId = conv.id;
    }

    const userMessage: Message = { role: "user", content: messageText };
    const newMessages = [...currentMessages, userMessage];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    // Reset textarea height
    const textarea = document.querySelector("textarea");
    if (textarea) textarea.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          conversationId: convId,
        }),
      });

      if (res.status === 429) {
        setRateLimited(true);
        setMessages((prev) => prev.slice(0, -1));
        setIsStreaming(false);
        return;
      }

      if (res.status === 500) {
        setMessages((prev) => prev.slice(0, -1));
        showToast("Something went wrong on our end. Try again in a moment.");
        setIsStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantText += chunk;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: assistantText },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.slice(0, -1));
      showToast("Something went wrong on our end. Try again in a moment.");
    } finally {
      setIsStreaming(false);
      setUsageRefreshTrigger((prev) => prev + 1);

      if (!activeConvId && convId) {
        setActiveConvId(convId);
      }
      setPendingNewChat(false);
    }

    // Generate title after first message only
    if (currentMessages.length === 0) {
      try {
        const titleRes = await fetch(`/api/conversations/${convId}/title`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstMessage: messageText }),
        });
        const { title } = await titleRes.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title } : c)),
        );
      } catch {
        // non-critical
      }
    }
  };

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 flex flex-col min-h-0 flex-shrink-0">
        {/* Sidebar header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <span className="font-semibold text-lg">Haha Ok</span>
          <UserButton />
        </div>

        {/* New chat button */}
        <div className="p-3 flex-shrink-0">
          <Button
            onClick={createConversation}
            variant="outline"
            className="w-full justify-start gap-2 border-zinc-700 hover:bg-zinc-800"
          >
            <PlusCircle size={16} />
            New Chat
          </Button>
        </div>

        {/* Conversations list - scrollable */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setActiveConvId(conv.id);
                setRateLimited(false);
                setPendingNewChat(false);
                setInput("");
                setMessages([]);
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-md text-sm mb-1 flex items-center gap-2 hover:bg-zinc-800 transition-colors group",
                activeConvId === conv.id && "bg-zinc-800",
              )}
            >
              <MessageCircle
                size={14}
                className="shrink-0 text-zinc-500 group-hover:text-zinc-400"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-zinc-300 group-hover:text-zinc-100 transition-colors">
                  {conv.title}
                </p>
                <p className="text-xs text-zinc-600">
                  {new Date(conv.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </button>
          ))}

          {conversations.length === 0 && (
            <p className="text-xs text-zinc-600 text-center mt-6 px-2">
              No chats yet. Start one and let the vibes begin.
            </p>
          )}
        </div>

        {/* Sidebar footer */}
        <div className="border-t border-zinc-800 flex-shrink-0">
          <UsageIndicator refreshTrigger={usageRefreshTrigger} />
          <div className="px-4 py-3 text-xs text-zinc-600 truncate">
            {user?.emailAddresses[0].emailAddress}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!activeConvId && !pendingNewChat ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500">
            <span className="text-4xl">😂</span>
            <p className="text-lg font-medium text-zinc-300">Haha Ok</p>
            <p className="text-sm">Whatever happens, we vibe.</p>
            <Button
              onClick={createConversation}
              className="mt-2 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              Start a chat
            </Button>
          </div>
        ) : (
          <>
            {/* Messages area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col justify-end min-h-full">
                <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-zinc-600 text-sm animate-pulse">
                        Loading the vibes...
                      </p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex",
                            msg.role === "user"
                              ? "justify-end"
                              : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed",
                              msg.role === "user"
                                ? "bg-zinc-100 text-zinc-900"
                                : "bg-zinc-800 text-zinc-100",
                            )}
                          >
                            {msg.content || (
                              <span className="text-zinc-500 animate-pulse">
                                thinking...
                              </span>
                            )}
                          </div>
                        </div>
                      ))}

                      {rateLimited && (
                        <div className="text-center py-4">
                          <div className="inline-block bg-zinc-800 rounded-2xl px-6 py-4 text-sm">
                            <p className="text-zinc-300 font-medium">
                              Haha ok you&apos;ve hit your limit 😅
                            </p>
                            <p className="text-zinc-500 mt-1">
                              Free tier is 10 messages per 5 hours. Upgrade for
                              30.
                            </p>
                          </div>
                        </div>
                      )}

                      <div ref={bottomRef} />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-zinc-800 flex-shrink-0">
              <div className="max-w-2xl mx-auto">
                <div className="relative flex items-end gap-2 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-zinc-500 transition-colors">
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                        e.currentTarget.style.height = "auto";
                      }
                    }}
                    placeholder={
                      rateLimited ? "Limit reached..." : "Share everything..."
                    }
                    disabled={isStreaming || rateLimited}
                    rows={1}
                    className="flex-1 w-full bg-transparent text-zinc-100 placeholder:text-zinc-500 text-sm leading-relaxed resize-none outline-none disabled:opacity-50 max-h-[200px] overflow-y-auto"
                  />
                  <Button
                    onClick={() => {
                      sendMessage();
                      const textarea = document.querySelector("textarea");
                      if (textarea) textarea.style.height = "auto";
                    }}
                    disabled={isStreaming || rateLimited || !input.trim()}
                    size="icon"
                    className="shrink-0 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-xl h-8 w-8"
                  >
                    <Send size={14} />
                  </Button>
                </div>
                <p className="text-xs text-zinc-600 mt-2 text-center">
                  Shift + Enter for new line
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}
