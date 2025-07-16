import { NextResponse } from "next/server"

export async function POST(request: Request) {
  console.log("🔊 ElevenLabs API route called")

  try {
    // Check if API key is available
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("❌ ElevenLabs API key is missing")
      return NextResponse.json({ error: "ElevenLabs API key is not configured" }, { status: 500 })
    }

    // Check if Voice ID is available
    if (!process.env.ELEVENLABS_VOICE_ID) {
      console.error("❌ ElevenLabs Voice ID is missing")
      return NextResponse.json({ error: "ElevenLabs Voice ID is not configured" }, { status: 500 })
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (error) {
      console.error("❌ Failed to parse request body:", error)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { text } = body

    console.log("📥 Received text for speech synthesis:", text)

    if (!text) {
      console.error("❌ No text provided for speech synthesis")
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    const VOICE_ID =  process.env.ELEVENLABS_VOICE_ID // Using my own trained voice
    const API_KEY = process.env.ELEVENLABS_API_KEY

    console.log("🎙️ Calling ElevenLabs API with text length:", text.length)

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": API_KEY!,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 1.0,
            speed: 1.0,
          },
        }),
      })

      console.log("🔄 ElevenLabs API status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ ElevenLabs API error: ${response.status}`, errorText)
        return NextResponse.json(
          { error: `ElevenLabs API error: ${response.status}`, details: errorText },
          { status: response.status },
        )
      }

      // Get the audio data as an ArrayBuffer
      const audioData = await response.arrayBuffer()
      console.log("✅ Received audio data, size:", audioData.byteLength)

      // Convert to base64 for sending to client
      const base64Audio = Buffer.from(audioData).toString("base64")
      console.log("📤 Sending base64 audio, length:", base64Audio.length)

      return NextResponse.json({ audio: base64Audio })
    } catch (error) {
      console.error("❌ Error calling ElevenLabs API:", error)
      return NextResponse.json({ error: "Failed to call ElevenLabs API", details: String(error) }, { status: 500 })
    }
  } catch (error) {
    console.error("❌ Unexpected error in ElevenLabs API route:", error)
    return NextResponse.json({ error: "An unexpected error occurred", details: String(error) }, { status: 500 })
  }
}
