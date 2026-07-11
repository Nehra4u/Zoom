import { create } from 'zustand'
import type { ActiveMeeting, SessionParticipant } from '@/types/session'

export type MeetingJoinMode = 'portal' | 'desktop'

const JOIN_MODE_KEY = 'zoomcontrol:joinMode'

function loadJoinMode(): MeetingJoinMode {
  try {
    const value = localStorage.getItem(JOIN_MODE_KEY)
    if (value === 'portal' || value === 'desktop') return value
  } catch {
    /* ignore */
  }
  return 'portal'
}

interface SessionStore {
  participants: SessionParticipant[]
  sessionActive: boolean
  meetingLive: boolean
  meeting: ActiveMeeting | null
  meetingOwnedByMe: boolean
  canEndMeeting: boolean
  joinMode: MeetingJoinMode
  desktopEndedDialogOpen: boolean
  portalJoined: boolean
  portalJoinAttempted: boolean
  portalJoinFailed: boolean
  portalJoinError: string | null
  socketConnected: boolean
  setSnapshot: (snapshot: {
    participants: SessionParticipant[]
    sessionActive: boolean
    meetingLive?: boolean
    meeting?: ActiveMeeting | null
    meetingOwnedByMe?: boolean
    canEndMeeting?: boolean
  }) => void
  setMeetingStarted: (meeting: ActiveMeeting) => void
  applyLiveMeeting: (meeting: ActiveMeeting, opts?: { canEndMeeting?: boolean; meetingOwnedByMe?: boolean }) => void
  setJoinMode: (mode: MeetingJoinMode) => void
  setDesktopEndedDialogOpen: (open: boolean) => void
  setPortalJoined: (joined: boolean) => void
  setPortalJoinAttempted: (attempted: boolean) => void
  setPortalJoinFailed: (failed: boolean, error?: string | null) => void
  setSocketConnected: (connected: boolean) => void
  upsertParticipant: (participant: SessionParticipant) => void
  removeParticipant: (userId: string) => void
  updateMute: (userId: string, isMuted: boolean) => void
  clearSession: () => void
  reset: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  participants: [],
  sessionActive: false,
  meetingLive: false,
  meeting: null,
  meetingOwnedByMe: false,
  canEndMeeting: false,
  joinMode: loadJoinMode(),
  desktopEndedDialogOpen: false,
  portalJoined: false,
  portalJoinAttempted: false,
  portalJoinFailed: false,
  portalJoinError: null,
  socketConnected: false,

  setSnapshot: ({ participants, sessionActive, meetingLive, meeting, meetingOwnedByMe, canEndMeeting }) =>
    set(() => {
      const live = meetingLive ?? false
      return {
        participants,
        sessionActive,
        meetingLive: live,
        meeting: meeting ?? null,
        meetingOwnedByMe: meetingOwnedByMe ?? false,
        canEndMeeting: canEndMeeting ?? false,
        ...(live === false
          ? {
              portalJoined: false,
              portalJoinAttempted: false,
              portalJoinFailed: false,
              portalJoinError: null,
            }
          : {}),
      }
    }),

  setMeetingStarted: (meeting) =>
    set({
      meetingLive: true,
      meeting,
      sessionActive: true,
      meetingOwnedByMe: true,
      canEndMeeting: true,
      desktopEndedDialogOpen: false,
    }),

  applyLiveMeeting: (meeting, opts) =>
    set({
      meetingLive: true,
      meeting,
      sessionActive: true,
      meetingOwnedByMe: opts?.meetingOwnedByMe ?? false,
      canEndMeeting: opts?.canEndMeeting ?? true,
      desktopEndedDialogOpen: false,
    }),

  setJoinMode: (joinMode) => {
    try {
      localStorage.setItem(JOIN_MODE_KEY, joinMode)
    } catch {
      /* ignore */
    }
    set({ joinMode })
  },

  setDesktopEndedDialogOpen: (desktopEndedDialogOpen) => set({ desktopEndedDialogOpen }),

  setPortalJoined: (portalJoined) => set({ portalJoined }),

  setPortalJoinAttempted: (portalJoinAttempted) => set({ portalJoinAttempted }),

  setPortalJoinFailed: (portalJoinFailed, error = null) =>
    set({ portalJoinFailed, portalJoinError: error }),

  setSocketConnected: (socketConnected) => set({ socketConnected }),

  upsertParticipant: (participant) =>
    set((state) => {
      const existing = state.participants.find((p) => p.userId === participant.userId)
      const participants = existing
        ? state.participants.map((p) => (p.userId === participant.userId ? { ...p, ...participant } : p))
        : [...state.participants, participant]
      return { participants, sessionActive: state.meetingLive || participants.length > 0 }
    }),

  removeParticipant: (userId) =>
    set((state) => {
      const participants = state.participants.filter((p) => p.userId !== userId)
      return {
        participants,
        sessionActive: state.meetingLive || participants.length > 0,
      }
    }),

  updateMute: (userId, isMuted) =>
    set((state) => ({
      participants: state.participants.map((p) => (p.userId === userId ? { ...p, isMuted } : p)),
    })),

  clearSession: () =>
    set({
      participants: [],
      sessionActive: false,
      meetingLive: false,
      meeting: null,
      meetingOwnedByMe: false,
      canEndMeeting: false,
      portalJoined: false,
      portalJoinAttempted: false,
      portalJoinFailed: false,
      portalJoinError: null,
    }),

  reset: () =>
    set({
      participants: [],
      sessionActive: false,
      meetingLive: false,
      meeting: null,
      meetingOwnedByMe: false,
      canEndMeeting: false,
      portalJoined: false,
      portalJoinAttempted: false,
      portalJoinFailed: false,
      portalJoinError: null,
      socketConnected: false,
    }),
}))
