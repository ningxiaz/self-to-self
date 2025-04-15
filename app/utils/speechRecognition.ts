"use client"

// Define the SpeechRecognition type
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: (event: any) => void
  onerror: (event: any) => void
  onend: (event: any) => void
  onstart: (event: any) => void
  onspeechend: (event: any) => void
  onnomatch: (event: any) => void
  onaudiostart: (event: any) => void
  onaudioend: (event: any) => void
  onsoundstart: (event: any) => void
  onsoundend: (event: any) => void
  onspeechstart: (event: any) => void
}

// Get the SpeechRecognition constructor
export function getSpeechRecognition(): {
  SpeechRecognition: new () => SpeechRecognition
  available: boolean
} {
  if (typeof window === "undefined") {
    return { SpeechRecognition: null as any, available: false }
  }

  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition

  return {
    SpeechRecognition,
    available: !!SpeechRecognition,
  }
}
