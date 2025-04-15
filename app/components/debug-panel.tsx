"use client"

import { useState, useEffect, useRef } from "react"

interface Log {
  timestamp: string
  message: string
  type: "info" | "error" | "warn"
}

export function DebugPanel() {
  const [logs, setLogs] = useState<Log[]>([])
  const [isVisible, setIsVisible] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const originalConsoleLog = console.log
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn

    function formatTime() {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`
    }

    console.log = (...args) => {
      originalConsoleLog(...args)
      const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

      setLogs((prev) => [
        ...prev,
        {
          timestamp: formatTime(),
          message,
          type: "info",
        },
      ])
    }

    console.error = (...args) => {
      originalConsoleError(...args)
      const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

      setLogs((prev) => [
        ...prev,
        {
          timestamp: formatTime(),
          message,
          type: "error",
        },
      ])
    }

    console.warn = (...args) => {
      originalConsoleWarn(...args)
      const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

      setLogs((prev) => [
        ...prev,
        {
          timestamp: formatTime(),
          message,
          type: "warn",
        },
      ])
    }

    return () => {
      console.log = originalConsoleLog
      console.error = originalConsoleError
      console.warn = originalConsoleWarn
    }
  }, [])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg z-50"
      >
        Show Debug Logs
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-1/2 lg:w-1/3 h-1/2 bg-gray-900 text-white z-50 shadow-lg rounded-t-lg overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-gray-800 border-b border-gray-700">
        <h3 className="font-bold">Debug Logs</h3>
        <div className="space-x-2">
          <button onClick={() => setLogs([])} className="px-2 py-1 bg-red-600 text-white text-xs rounded">
            Clear
          </button>
          <button onClick={() => setIsVisible(false)} className="px-2 py-1 bg-gray-600 text-white text-xs rounded">
            Hide
          </button>
        </div>
      </div>
      <div
        ref={logContainerRef}
        className="h-full overflow-y-auto p-2 font-mono text-xs"
        style={{ maxHeight: "calc(50vh - 40px)" }}
      >
        {logs.map((log, index) => (
          <div
            key={index}
            className={`mb-1 ${
              log.type === "error" ? "text-red-400" : log.type === "warn" ? "text-yellow-400" : "text-green-400"
            }`}
          >
            <span className="text-gray-400">[{log.timestamp}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  )
}
