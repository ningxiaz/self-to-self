"use client"

import { useState, useRef, useEffect } from "react"
import { getSpeechRecognition } from "./utils/speechRecognition"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "./components/debug-panel"
import Image from "next/image"

export default function VoiceChatBot() {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([])
  const [conversationStarted, setConversationStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [lastSpeechTime, setLastSpeechTime] = useState(0)
  const [apiKeyError, setApiKeyError] = useState(false)

  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processingRef = useRef<boolean>(false)
  const isListeningRef = useRef<boolean>(false)
  // Keep track of the current transcript in a ref to access in callbacks
  const currentTranscriptRef = useRef<string>("")

  // Update isListeningRef when isListening changes
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // Initialize audio element
  useEffect(() => {
    console.log("🎧 Initializing audio element")
    audioRef.current = new Audio()

    audioRef.current.onloadeddata = () => {
      console.log("🔊 Audio loaded and ready to play")
    }

    audioRef.current.onplay = () => {
      console.log("▶️ Audio started playing")
    }

    audioRef.current.onended = () => {
      console.log("⏹️ Audio playback ended")
      setIsSpeaking(false)
      // Start listening again after speaking is done
      if (conversationStarted) {
        console.log("🔄 Restarting listening after audio ended")
        setTimeout(() => {
          startListening()
        }, 300) // Small delay to ensure everything is reset
      }
    }

    audioRef.current.onerror = (e) => {
      console.error("❌ Audio playback error:", e)
      setError(`Audio playback error: ${e}`)
      // Start listening again after error
      if (conversationStarted) {
        setTimeout(startListening, 1000)
      }
    }

    return () => {
      if (audioRef.current) {
        console.log("🧹 Cleaning up audio element")
        audioRef.current.onended = null
        audioRef.current.onloadeddata = null
        audioRef.current.onplay = null
        audioRef.current.onerror = null
      }
    }
  }, [conversationStarted])

  // Silence detection timer
  useEffect(() => {
    // Only run silence detection when actively listening
    if (!isListening || isSpeaking || isProcessing) return

    // Check if we have a transcript and if enough time has passed since last speech
    const checkSilence = () => {
      const now = Date.now()
      const silenceDuration = now - lastSpeechTime

      // If we have a transcript and silence has been detected
      if (currentTranscriptRef.current.trim() && silenceDuration > 1500 && !processingRef.current) {
        console.log(`🔇 Silence detected for ${silenceDuration}ms, processing speech:`, currentTranscriptRef.current)
        processSpeech(currentTranscriptRef.current)
      }
    }

    // Set up interval to check for silence
    const silenceInterval = setInterval(checkSilence, 500)

    return () => {
      clearInterval(silenceInterval)
    }
  }, [isListening, isSpeaking, isProcessing, lastSpeechTime])

  // Setup speech recognition
  const setupSpeechRecognition = () => {
    console.log("🎤 Setting up speech recognition")
    const { SpeechRecognition, available } = getSpeechRecognition()

    if (!available) {
      const errorMsg = "Speech recognition is not supported in your browser"
      console.error(`❌ ${errorMsg}`)
      setError(errorMsg)
      alert(errorMsg)
      return false
    }

    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = true
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = "en-US"

    recognitionRef.current.onstart = () => {
      console.log("🎤 Speech recognition started")
      processingRef.current = false
      setIsListening(true)
    }

    recognitionRef.current.onresult = (event: any) => {
      // Update the last speech time whenever we get a result
      setLastSpeechTime(Date.now())

      // Log the entire results object to see what we're getting
      console.log(
        "🎤 Speech recognition results:",
        JSON.stringify({
          resultLength: event.results.length,
          resultIndex: event.resultIndex,
          isFinal: event.results[event.resultIndex]?.isFinal,
        }),
      )

      // Get the current result
      const result = event.results[event.resultIndex]
      const transcriptText = result[0].transcript

      // Log whether this result is marked as final
      console.log(`🎤 Result ${event.resultIndex}: "${transcriptText}" (isFinal: ${result.isFinal})`)

      // Update the transcript state and ref
      setTranscript(transcriptText)
      currentTranscriptRef.current = transcriptText
    }

    recognitionRef.current.onend = () => {
      // This is triggered when recognition stops
      console.log("🛑 Speech recognition ended")
      setIsListening(false)

      // Process the current transcript if we have one and haven't processed it yet
      const currentText = currentTranscriptRef.current.trim()
      if (currentText && !processingRef.current && conversationStarted && !isSpeaking) {
        console.log("📝 Processing transcript after recognition ended:", currentText)
        processSpeech(currentText)
      } else if (!processingRef.current && conversationStarted && !isSpeaking) {
        // If we don't have a transcript but recognition ended, restart listening
        console.log("🔄 No transcript, restarting listening")
        setTimeout(startListening, 500)
      }
    }

    recognitionRef.current.onerror = (event: any) => {
      console.error("❌ Speech recognition error:", event.error)
      setError(`Speech recognition error: ${event.error}`)

      // Restart listening on non-fatal errors
      if (event.error !== "aborted" && event.error !== "not-allowed" && conversationStarted && !isSpeaking) {
        console.log("🔄 Restarting listening after error")
        setTimeout(startListening, 1000)
      }
    }

    return true
  }

  const startListening = () => {
    // Don't start listening if we're already listening, speaking, or processing
    if (isListeningRef.current || isSpeaking || isProcessing) {
      console.log("⚠️ Already in an active state, not starting listening")
      return
    }

    console.log("🎤 Starting listening...")
    setError(null)

    if (!recognitionRef.current && !setupSpeechRecognition()) {
      return
    }

    // Clear transcript when starting new listening session
    setTranscript("")
    currentTranscriptRef.current = ""
    processingRef.current = false

    // Initialize the last speech time
    setLastSpeechTime(Date.now())

    try {
      recognitionRef.current.start()
      console.log("✅ Speech recognition started successfully")
    } catch (error) {
      console.error("❌ Error starting speech recognition:", error)
      setError(`Error starting speech recognition: ${error}`)

      // Try to restart if there was an error starting
      if (conversationStarted) {
        setTimeout(startListening, 1000)
      }
    }
  }

  const stopListening = () => {
    console.log("🛑 Stopping listening")

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
        console.log("✅ Speech recognition stopped successfully")
      } catch (error) {
        console.error("❌ Error stopping speech recognition:", error)
      }
    }

    setIsListening(false)
  }

  // Function to call OpenAI API
  const generateChatResponse = async (message: string) => {
    console.log("🤖 Generating chat response for:", message)
    setApiKeyError(false)

    try {
      console.log("📡 Sending request to /api/chat")
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      })

      console.log("🔄 Chat API response status:", response.status)

      const responseText = await response.text()
      console.log("📥 Raw API response:", responseText)

      if (!response.ok) {
        // Try to parse the error response
        try {
          const errorData = JSON.parse(responseText)

          // Check if this is an API key error
          if (
            response.status === 401 ||
            (errorData.error && (errorData.error.includes("API key") || errorData.error.includes("Authentication")))
          ) {
            setApiKeyError(true)
            throw new Error(
              `API Key Error: ${errorData.details || errorData.error || "Invalid API key or organization ID"}`,
            )
          }

          throw new Error(`${response.status} - ${errorData.error || "Unknown error"}`)
        } catch (e) {
          // If we can't parse the JSON, use the raw text
          throw new Error(`${response.status} - ${responseText}`)
        }
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        console.error("❌ Failed to parse JSON response:", e)
        throw new Error(`Invalid JSON response: ${responseText}`)
      }

      console.log("✅ Parsed chat response:", data)

      if (!data.content) {
        console.error("❌ No content in response:", data)
        throw new Error("No content in response")
      }

      // Reset retry count on successful response
      setRetryCount(0)
      return data.content
    } catch (error) {
      console.error("❌ Error calling chat API:", error)
      setError(`Error calling chat API: ${error}`)

      // Increment retry count
      setRetryCount((prev) => prev + 1)

      // Return a fallback response so the conversation can continue
      if (apiKeyError) {
        return "I'm having trouble with my API key or organization ID. Please check the API configuration in your environment variables."
      } else {
        return "I'm sorry, I'm having trouble connecting to my brain right now. Could you try again in a moment?"
      }
    }
  }

  // Process speech function
  const processSpeech = (transcriptText: string) => {
    // Set processing flag to prevent duplicate processing
    if (processingRef.current) {
      console.log("⚠️ Already processing speech, skipping")
      return
    }

    processingRef.current = true
    console.log("🎯 Processing speech:", transcriptText)
    stopListening()

    // Now call handleSpeechEnd with the transcript
    handleSpeechEnd(transcriptText)
  }

  const handleSpeechEnd = async (finalTranscript: string) => {
    setError(null)

    if (!finalTranscript.trim()) {
      console.log("⚠️ Empty transcript, not processing")
      processingRef.current = false
      // Restart listening if we're not processing anything
      if (conversationStarted && !isSpeaking) {
        setTimeout(startListening, 500)
      }
      return
    }

    // Add user message to conversation
    const userMessage = finalTranscript.trim()
    console.log("👤 User message:", userMessage)
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])

    // Process with OpenAI
    setIsProcessing(true)
    try {
      console.log("🤖 Generating AI response...")
      const response = await generateChatResponse(userMessage)
      console.log("🤖 AI response received:", response)

      // Add assistant message to conversation
      setMessages((prev) => [...prev, { role: "assistant", content: response }])

      // Convert to speech
      console.log("🔊 Converting to speech...")
      const audioBase64 = await textToSpeech(response)
      console.log("🔊 Speech audio received, length:", audioBase64.length)

      // Play the audio
      if (audioRef.current) {
        console.log("🎧 Creating audio blob and URL")
        const audioBlob = base64ToBlob(audioBase64, "audio/mpeg")
        const audioUrl = URL.createObjectURL(audioBlob)

        console.log("🎧 Setting audio source and playing")
        audioRef.current.src = audioUrl
        setIsSpeaking(true)

        try {
          const playPromise = audioRef.current.play()
          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              console.error("❌ Audio play error:", error)
              setError(`Audio play error: ${error}`)
              setIsSpeaking(false)
              processingRef.current = false
              // Start listening again after error
              if (conversationStarted) {
                setTimeout(startListening, 2000)
              }
            })
          }
        } catch (error) {
          console.error("❌ Error playing audio:", error)
          setError(`Audio play error: ${error}`)
          setIsSpeaking(false)
          processingRef.current = false
          // Start listening again after error
          if (conversationStarted) {
            setTimeout(startListening, 2000)
          }
        }
      } else {
        console.error("❌ Audio element not initialized")
        setError("Audio element not initialized")
        processingRef.current = false
        // Start listening again after error
        if (conversationStarted) {
          setTimeout(startListening, 2000)
        }
      }
    } catch (error) {
      console.error("❌ Error processing speech:", error)
      setError(`Error processing speech: ${error}`)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error processing your request.",
        },
      ])
      processingRef.current = false
      // Start listening again after error
      if (conversationStarted) {
        setTimeout(startListening, 2000)
      }
    } finally {
      setIsProcessing(false)
      processingRef.current = false
    }
  }

  // Function to call ElevenLabs API
  const textToSpeech = async (text: string) => {
    console.log("🔊 Converting text to speech:", text)

    try {
      console.log("📡 Sending request to /api/speech")
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      })

      console.log("🔄 Speech API response status:", response.status)

      const responseText = await response.text()
      console.log("📥 Raw API response length:", responseText.length)

      if (!response.ok) {
        // Try to parse the error response
        try {
          const errorData = JSON.parse(responseText)
          throw new Error(`${response.status} - ${errorData.error || "Unknown error"}`)
        } catch (e) {
          // If we can't parse the raw text
          throw new Error(`${response.status} - ${responseText.substring(0, 100)}...`)
        }
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        console.error("❌ Failed to parse JSON response:", e)
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`)
      }

      console.log("✅ Received speech data, audio length:", data.audio ? data.audio.length : "no audio")

      if (!data.audio) {
        console.error("❌ No audio in response:", data)
        throw new Error("No audio in response")
      }

      return data.audio
    } catch (error) {
      console.error("❌ Error calling speech API:", error)
      setError(`Error calling speech API: ${error}`)
      throw error
    }
  }

  const startConversation = () => {
    console.log("🚀 Starting conversation")
    setConversationStarted(true)
    setMessages([])
    setError(null)
    setRetryCount(0)
    processingRef.current = false
    startListening()
  }

  const stopConversation = () => {
    console.log("⏹️ Stopping conversation")
    stopListening()
    setConversationStarted(false)
    processingRef.current = false

    if (audioRef.current) {
      console.log("⏹️ Stopping audio playback")
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    setIsSpeaking(false)
  }

  // Helper function to convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string) => {
    console.log("🔄 Converting base64 to blob, length:", base64.length)
    const byteCharacters = atob(base64)
    const byteArrays = []

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512)

      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }

      const byteArray = new Uint8Array(byteNumbers)
      byteArrays.push(byteArray)
    }

    const blob = new Blob(byteArrays, { type: mimeType })
    console.log("✅ Blob created, size:", blob.size)
    return blob
  }

  if (!conversationStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-purple-900 flex flex-col items-center justify-center p-4">
        {/* Avatar with glow effect */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-purple-500 blur-3xl opacity-50 scale-110"></div>
          <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-purple-400/30">
            <Image
              src="/ningxia-avatar.jpg"
              alt="Ningxia"
              width={192}
              height={192}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Name */}
        <h1 className="text-4xl font-light text-white mb-12 tracking-wide">Ningxia</h1>

        {/* Start button */}
        <Button
          onClick={startConversation}
          className="bg-transparent border border-white/30 text-white hover:bg-white/10 hover:border-white/50 px-8 py-3 rounded-full text-lg font-light tracking-wide transition-all duration-300"
        >
          Start conversation
        </Button>

        {/* Error messages */}
        {error && (
          <div className="mt-8 max-w-md">
            <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg backdrop-blur-sm">
              <strong className="font-semibold">Error: </strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        <DebugPanel />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-purple-900 flex flex-col">
      {/* Header with avatar and name */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-purple-500 blur-xl opacity-30"></div>
            <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-purple-400/30">
              <Image
                src="/ningxia-avatar.jpg"
                alt="Ningxia"
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <h1 className="text-xl font-light text-white">Ningxia</h1>
        </div>

        <Button
          onClick={stopConversation}
          className="bg-red-900/50 border border-red-500/50 text-red-200 hover:bg-red-900/70 hover:border-red-500/70 px-4 py-2 rounded-full text-sm transition-all duration-300"
        >
          End conversation
        </Button>
      </div>

      {/* Status indicators */}
      <div className="px-6 py-4 space-y-2">
        {isListening && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-blue-400 text-sm">Listening...</span>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
            <span className="text-amber-400 text-sm">Processing...</span>
          </div>
        )}

        {isSpeaking && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-400 text-sm">Speaking...</span>
          </div>
        )}

        {transcript && isListening && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-3 rounded-lg">
            <span className="text-white/70 text-sm">{transcript}</span>
          </div>
        )}

        {apiKeyError && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg backdrop-blur-sm">
            <strong className="font-semibold">API Key Error: </strong>
            <span>
              Your OpenAI API key or organization ID appears to be invalid. Please check your API configuration.
            </span>
          </div>
        )}

        {error && !apiKeyError && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg backdrop-blur-sm">
            <strong className="font-semibold">Error: </strong>
            <span>{error}</span>
          </div>
        )}

        {retryCount > 0 && !apiKeyError && (
          <div className="bg-yellow-900/50 border border-yellow-500/50 text-yellow-200 px-4 py-3 rounded-lg backdrop-blur-sm">
            <strong className="font-semibold">Notice: </strong>
            <span>Having trouble connecting to the AI service. Retry count: {retryCount}</span>
          </div>
        )}
      </div>

      {/* Chat messages */}
      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-white/50 mt-32">
              <p>Start speaking to begin your conversation with Ningxia</p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-purple-600/80 text-white rounded-br-sm"
                    : "bg-white/10 text-white rounded-bl-sm backdrop-blur-sm border border-white/10"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DebugPanel />
    </div>
  )
}
