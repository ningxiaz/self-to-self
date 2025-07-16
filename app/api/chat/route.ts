import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

// Read the context.json file once when the module is loaded
interface ContextMessage {
  role: string
  content: string
}

let contextData: ContextMessage[] = []
try {
  // Get the absolute path to the context.json file in the app folder
  const contextFilePath = path.join(process.cwd(), "app", "context.json")
  console.log("📂 Reading context file from:", contextFilePath)

  // Check if the file exists
  if (fs.existsSync(contextFilePath)) {
    const contextFileContent = fs.readFileSync(contextFilePath, "utf8")
    contextData = JSON.parse(contextFileContent)
    console.log("📄 Context data loaded:", contextData)
  } else {
    console.warn("⚠️ Context file not found at:", contextFilePath)
  }
} catch (error) {
  console.error("❌ Error reading context file:", error)
  // Continue without context if there's an error
}

export async function POST(request: Request) {
  console.log("🔵 OpenAI API route called")

  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OpenAI API key is missing")
      return NextResponse.json({ error: "OpenAI API key is not configured" }, { status: 500 })
    }

    // Log the first few characters of the API key for debugging (safely)
    const apiKey = process.env.OPENAI_API_KEY
    console.log("🔑 API Key format check:", {
      prefix: apiKey.substring(0, 7) + "...",
      length: apiKey.length,
    })

    // Check if organization ID is available
    const orgId = process.env.OPENAI_ORG_ID
    if (orgId) {
      console.log("🏢 Using organization ID:", orgId.substring(0, 5) + "...")
    } else {
      console.warn("⚠️ No organization ID provided")
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (error) {
      console.error("❌ Failed to parse request body:", error)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { message } = body

    console.log("📥 Received message:", message)

    if (!message) {
      console.error("❌ No message provided in request")
      return NextResponse.json({ error: "No message provided" }, { status: 400 })
    }

    console.log("🤖 Calling OpenAI API with message:", message)
    contextData.push({role: "user", content: message})

    try {
      // Determine if we're using a standard OpenAI key or a project key
      const isProjectKey = apiKey.startsWith("sk-proj-")

      // Set the appropriate API endpoint and headers
      const apiEndpoint = "https://api.openai.com/v1/chat/completions"

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }

      // Add organization ID to headers if available
      if (orgId) {
        headers["OpenAI-Organization"] = orgId
        console.log("🏢 Added organization ID to request headers")
      }

      console.log("🌐 Using API endpoint:", apiEndpoint)
      console.log("📋 Headers (sanitized):", {
        ...headers,
        Authorization: "Bearer sk-***", // Don't log the actual token
      })

      // Use fetch directly instead of the OpenAI client
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          // Add the context data as input parameter
          messages: contextData,
          temperature: 0.7,
          max_tokens: 40,
        }),
      })

      console.log("🔄 OpenAI API status:", response.status)

      const responseData = await response.json()
      console.log("✅ OpenAI API response received:", JSON.stringify(responseData))

      if (!response.ok) {
        console.error("❌ OpenAI API error:", responseData)
        return NextResponse.json(
          { error: "Error from OpenAI API", details: responseData.error?.message || "Unknown error" },
          { status: response.status },
        )
      }

      const content = responseData.choices[0]?.message?.content || "Sorry, I couldn't generate a response."
      console.log("📤 Sending response:", content)

      return NextResponse.json({ content })
    } catch (error) {
      console.error("❌ Error calling OpenAI API:", error)
      return NextResponse.json({ error: "Failed to call OpenAI API", details: String(error) }, { status: 500 })
    }
  } catch (error) {
    console.error("❌ Unexpected error in OpenAI API route:", error)
    return NextResponse.json({ error: "An unexpected error occurred", details: String(error) }, { status: 500 })
  }
}
