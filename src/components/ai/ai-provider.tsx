"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { AiChat } from "./ai-chat";

interface AiContextValue {
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

const AiContext = createContext<AiContextValue>({
  isChatOpen: false,
  openChat: () => {},
  closeChat: () => {},
  toggleChat: () => {},
});

export function useAi() {
  return useContext(AiContext);
}

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);

  return (
    <AiContext.Provider value={{ isChatOpen, openChat, closeChat, toggleChat }}>
      {children}
      <AiChat isOpen={isChatOpen} onClose={closeChat} />
    </AiContext.Provider>
  );
}
