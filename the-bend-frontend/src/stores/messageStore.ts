import { create } from 'zustand';
import type { MessageThread, Message } from '@/types';

interface MessageState {
  threads: MessageThread[];
  activeThread: MessageThread | null;
  messages: Message[];
  unreadCount: number;
  setThreads: (threads: MessageThread[]) => void;
  setActiveThread: (thread: MessageThread | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setUnreadCount: (count: number) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  threads: [],
  activeThread: null,
  messages: [],
  unreadCount: 0,
  setThreads: (threads) => set({ threads }),
  setActiveThread: (thread) => set({ activeThread: thread }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setUnreadCount: (count) => set({ unreadCount: count }),
}));
