"use client"

import { useState, useRef, useEffect } from "react"
import { getSpeechRecognition } from "./utils/speechRecognition"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "./components/debug-panel"

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
      return "I'm sorry, I'm having trouble connecting to my brain right now. Could you try again in a moment?"
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

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-center mb-6">Voice Chat Bot</h1>

          <div className="flex justify-center mb-6">
            {!conversationStarted ? (
              <Button
                onClick={startConversation}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full"
              >
                Start Conversation
              </Button>
            ) : (
              <Button
                onClick={stopConversation}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full"
              >
                End Conversation
              </Button>
            )}
          </div>

          <div className="flex flex-col space-y-2 mb-4">
            {isListening && <div className="text-center text-sm text-blue-600 animate-pulse">Listening...</div>}

            {isProcessing && <div className="text-center text-sm text-amber-600">Processing...</div>}

            {isSpeaking && <div className="text-center text-sm text-green-600 animate-pulse">Speaking...</div>}

            {transcript && isListening && <div className="bg-gray-100 p-3 rounded-lg text-sm">{transcript}</div>}

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}

            {retryCount > 0 && (
              <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative">
                <strong className="font-bold">Notice: </strong>
                <span className="block sm:inline">
                  Having trouble connecting to the AI service. Retry count: {retryCount}
                </span>
              </div>
            )}
          </div>

          <div className="border rounded-lg h-96 overflow-y-auto p-4 bg-gray-50">
            {messages.length === 0 && !conversationStarted && (
              <div className="text-center text-gray-500 mt-32">Press the button to start a voice conversation</div>
            )}

            {messages.map((msg, index) => (
              <div key={index} className={`mb-4 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                <div
                  className={`inline-block px-4 py-2 rounded-lg ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-200 text-gray-800 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>This voice chat bot uses OpenAI for responses and ElevenLabs for text-to-speech.</p>
        <p className="mt-1">Speak clearly and wait for a response before continuing.</p>
      </div>
      <DebugPanel />
    </div>
  )
}
