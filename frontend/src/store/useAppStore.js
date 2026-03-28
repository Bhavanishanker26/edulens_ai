import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set, get) => ({
      // User state
      user: null,
      setUser: (user) => set({ user }),

      // Current session
      currentSession: null,
      setCurrentSession: (session) => set({ currentSession: session }), // ✅ Fixed: was set({ currentSession }) which is always undefined

      // Processing state — NOT persisted (reset on load via partialize below)
      isProcessing: false,
      setIsProcessing: (status) => set({ isProcessing: status }),

      // Streamed content — NOT persisted
      streamedContent: {
        classification: null,
        ocr: null,
        explanation: '',
        quiz: ''
      },
      updateStreamedContent: (type, data) =>
        set((state) => ({
          streamedContent: {
            ...state.streamedContent,
            [type]: type === 'explanation' || type === 'quiz'
              ? state.streamedContent[type] + data
              : data
          }
        })),
      resetStreamedContent: () =>
        set({
          streamedContent: {
            classification: null,
            ocr: null,
            explanation: '',
            quiz: ''
          }
        }),

      // History
      history: [],
      addToHistory: (session) =>
        set((state) => ({ history: [session, ...state.history] })),

      // Preferences
      preferences: {
        difficulty: 'intermediate',
        autoGenerateQuiz: true
      },
      setPreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs }
        }))
    }),
    {
      name: 'edulens-storage',

      // ✅ Only persist preferences, user, and history
      // isProcessing and streamedContent are intentionally excluded
      // so they always reset to defaults on page load
      partialize: (state) => ({
        user: state.user,
        preferences: state.preferences,
        history: state.history,
      }),
    }
  )
);