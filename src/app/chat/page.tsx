'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, RotateCcw, Wrench, Sparkles } from 'lucide-react';
import { Navbar } from '@/components/Navbar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type LoadingState = 'idle' | 'thinking' | 'tool-call' | 'streaming';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [toolCallName, setToolCallName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string | null>(null); // Use ref to track thread_id reliably

  // Load thread_id from localStorage on mount
  useEffect(() => {
    const savedThreadId = localStorage.getItem('watson_thread_id');
    if (savedThreadId) {
      setThreadId(savedThreadId);
      threadIdRef.current = savedThreadId;
    }
  }, []);

  // Save thread_id to localStorage whenever it changes and update ref
  useEffect(() => {
    if (threadId) {
      localStorage.setItem('watson_thread_id', threadId);
      threadIdRef.current = threadId;
    } else {
      threadIdRef.current = null;
    }
  }, [threadId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setLoadingState('thinking');
    setToolCallName(null);
    setError(null);

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Always use the ref value to ensure we have the latest thread_id
      const currentThreadId = threadIdRef.current || threadId || localStorage.getItem('watson_thread_id');
      
      const requestBody = {
        message: userMessage.content,
        ...(currentThreadId && { thread_id: currentThreadId }),
      };

      // Log thread_id for debugging
      if (currentThreadId) {
        console.log('Sending message with thread_id:', currentThreadId);
      } else {
        console.log('Starting new conversation (no thread_id)');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Create assistant message
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (SSE format: "data: {...}\n\n")
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith(':')) {
            continue;
          }

          // Handle SSE format: "data: {...}"
          if (trimmedLine.startsWith('data: ')) {
            try {
              const jsonStr = trimmedLine.slice(6);
              if (jsonStr === '[DONE]') {
                break;
              }
              
              const data = JSON.parse(jsonStr);
              
              // Handle OpenAI-compatible format
              if (data.choices?.[0]?.delta?.content) {
                const content = data.choices[0].delta.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + content }
                      : msg
                  )
                );
              }
              
              // Handle Watson Orchestrate specific format
              if (data.content) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
              }
              
              // Handle event-based format from Watson Orchestrate
              if (data.event === 'message.delta' && data.data?.content) {
                setLoadingState('streaming');
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.data.content }
                      : msg
                  )
                );
              }

              // Handle thinking state
              if (data.event === 'run.step.thinking' || data.event === 'planning') {
                setLoadingState('thinking');
              }

              // Handle tool call events
              if (data.event === 'run.step.started') {
                const toolName = data.data?.tool_name || data.data?.name || data.tool_name;
                if (toolName) {
                  setLoadingState('tool-call');
                  setToolCallName(toolName);
                }
              }

              if (data.event === 'run.step.completed' || data.event === 'run.step.delta') {
                // Tool call is progressing or completed, but content might still be streaming
                if (data.data?.content || data.content) {
                  setLoadingState('streaming');
                }
              }

              // Handle message completion
              if (data.event === 'message.completed' || data.event === 'run.completed') {
                setLoadingState('idle');
                setToolCallName(null);
              }

              // Extract thread_id from various possible locations in the response
              // CRITICAL: Only set thread_id ONCE when we first receive it (first message in conversation)
              // After that, NEVER update it - always reuse the same thread_id
              const currentThreadId = threadIdRef.current || threadId || localStorage.getItem('watson_thread_id');
              
              // Only extract and set thread_id if we don't have one yet
              if (!currentThreadId) {
                // Look for thread_id in common response locations
                // NOTE: Do NOT use data.id as it might be a message ID, not thread ID
                const receivedThreadId = 
                  data.thread_id || 
                  data.data?.thread_id || 
                  data.context?.thread_id;
                
                if (receivedThreadId && typeof receivedThreadId === 'string') {
                  console.log('Received new thread_id (first message):', receivedThreadId);
                  setThreadId(receivedThreadId);
                  threadIdRef.current = receivedThreadId;
                  localStorage.setItem('watson_thread_id', receivedThreadId);
                }
              }
              // If we already have a thread_id, DO NOT update it - ignore any thread_id in the response
            } catch (e) {
              // If not JSON, treat as plain text
              const textContent = trimmedLine.slice(6);
              if (textContent) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + textContent }
                      : msg
                  )
                );
              }
            }
          } else if (trimmedLine) {
            // Handle plain text streaming (non-SSE format)
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + trimmedLine + '\n' }
                  : msg
              )
            );
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + buffer }
              : msg
          )
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
        return;
      }
      console.error('Chat error:', err);
      setError(err.message || 'Failed to send message');
      
      // Remove the assistant message if there was an error
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
      setLoadingState('idle');
      setToolCallName(null);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setThreadId(null);
    threadIdRef.current = null;
    localStorage.removeItem('watson_thread_id');
    setError(null);
  };

  return (
    <div className="chat-page-container">
      {/* Header */}
      <Navbar>
        {threadId && (
          <span style={{ 
            marginLeft: '0.75rem', 
            fontSize: '0.75rem',
            color: 'var(--accent-green)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              background: 'var(--accent-green)',
              display: 'inline-block'
            }}></span>
            Thread Active
          </span>
        )}
      </Navbar>

      {/* New Chat Button */}
      {threadId && (
        <div className="chat-new-conversation-wrapper">
          <button
            onClick={handleNewConversation}
            className="refresh-button"
            title="Start new conversation"
          >
            <RotateCcw className="w-4 h-4" />
            New Chat
          </button>
        </div>
      )}

      {/* Chat Container */}
      <div className="chat-wrapper">
        {/* Messages Area */}
        <div className="chat-messages-container">
          {messages.length === 0 && (
            <div className="chat-empty-state">
              <div className="chat-empty-icon-wrapper">
                <Bot size={48} className="chat-empty-icon" />
              </div>
              <h2 className="chat-empty-title">Start a conversation</h2>
              <p className="chat-empty-hint">Ask questions or request assistance from Watson Orchestrate</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message ${message.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
            >
              <div className="chat-message-avatar">
                {message.role === 'user' ? (
                  <User size={20} />
                ) : (
                  <Bot size={20} />
                )}
              </div>
              <div className="chat-message-content">
                <div className="chat-message-text">
                  {message.content || (message.role === 'assistant' && isLoading ? (
                    <span className="chat-typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  ) : null)}
                </div>
                <div className="chat-message-time">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-message-avatar">
                <Bot size={20} />
              </div>
              <div className="chat-message-content">
                <div className="chat-message-text chat-loading-state">
                  {loadingState === 'thinking' && (
                    <div className="chat-loading-content">
                      <Sparkles size={16} className="chat-loading-icon" />
                      <span>Thinking...</span>
                    </div>
                  )}
                  {loadingState === 'tool-call' && (
                    <div className="chat-loading-content">
                      <Wrench size={16} className="chat-loading-icon" />
                      <span>Using {toolCallName || 'tool'}...</span>
                    </div>
                  )}
                  {loadingState === 'streaming' && (
                    <div className="chat-loading-content">
                      <Loader2 size={16} className="chat-loading-spinner" />
                      <span>Generating response...</span>
                    </div>
                  )}
                  {loadingState === 'idle' && (
                    <div className="chat-loading-content">
                      <Loader2 size={16} className="chat-loading-spinner" />
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="chat-error-container">
            <div className="error-icon">⚠</div>
            <div className="error-content">
              <p className="error-message">{error}</p>
              <button className="retry-button" onClick={() => setError(null)} style={{ marginTop: '0.5rem' }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              rows={1}
              className="chat-input"
              disabled={isLoading}
            />
            <div className="chat-input-actions">
              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="chat-send-button chat-stop-button"
                  title="Stop generation"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="chat-send-button"
                  title="Send message"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .chat-page-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          padding: 1.5rem;
          box-sizing: border-box;
        }

        .chat-new-conversation-wrapper {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 1rem;
          flex-shrink: 0;
        }

        .chat-wrapper {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          background: var(--bg-card);
          border: 1px solid var(--border-primary);
          border-radius: 16px;
          overflow: hidden;
        }

        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .chat-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary);
          text-align: center;
          padding: 3rem 2rem;
        }

        .chat-empty-icon-wrapper {
          width: 80px;
          height: 80px;
          background: var(--gradient-card);
          border: 1px solid var(--border-primary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.5rem;
          color: var(--accent-cyan);
        }

        .chat-empty-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
        }

        .chat-empty-hint {
          font-size: 0.9rem;
          color: var(--text-muted);
          max-width: 400px;
        }

        .chat-message {
          display: flex;
          gap: 1rem;
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chat-message-user {
          flex-direction: row-reverse;
        }

        .chat-message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
        }

        .chat-message-user .chat-message-avatar {
          background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%);
          border: none;
          color: white;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .chat-message-assistant .chat-message-avatar {
          background: var(--bg-card);
          color: var(--accent-cyan);
          border-color: rgba(6, 182, 212, 0.3);
        }

        .chat-message-content {
          flex: 1;
          max-width: 75%;
        }

        .chat-message-user .chat-message-content {
          text-align: right;
        }

        .chat-message-text {
          padding: 0.875rem 1.125rem;
          border-radius: 18px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          color: var(--text-primary);
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
          transition: all 0.2s ease;
          font-size: 0.95rem;
        }

        .chat-message-user .chat-message-text {
          background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%);
          color: white;
          border: none;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
        }

        .chat-message-assistant .chat-message-text {
          background: var(--bg-card);
          border-color: var(--border-primary);
        }

        .chat-message-text:hover {
          border-color: var(--border-glow);
        }

        .chat-loading-state {
          background: var(--bg-card) !important;
          border-color: rgba(6, 182, 212, 0.3) !important;
        }

        .chat-loading-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
        }

        .chat-loading-icon {
          color: var(--accent-cyan);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .chat-message-time {
          font-size: 0.7rem;
          color: var(--text-muted);
          margin-top: 0.375rem;
          padding: 0 0.5rem;
          font-weight: 400;
        }

        .chat-typing-indicator {
          display: inline-flex;
          gap: 0.4rem;
        }

        .chat-typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-cyan);
          animation: typing 1.4s infinite;
        }

        .chat-typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .chat-typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-10px);
            opacity: 1;
          }
        }

        .chat-loading-spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .chat-error-container {
          margin: 1rem 2rem;
          padding: 1rem 1.25rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--accent-red);
          border-radius: 12px;
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .chat-error-container .error-icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          color: var(--accent-red);
          font-size: 1.25rem;
        }

        .error-content {
          flex: 1;
        }

        .chat-input-area {
          padding: 1.5rem;
          border-top: 1px solid var(--border-primary);
          background: var(--bg-secondary);
        }

        .chat-input-wrapper {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
          background: var(--bg-card);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          transition: all 0.2s ease;
        }

        .chat-input-wrapper:focus-within {
          border-color: var(--border-glow);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .chat-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 0.95rem;
          resize: none;
          outline: none;
          max-height: 150px;
          overflow-y: auto;
          line-height: 1.5;
        }

        .chat-input::placeholder {
          color: var(--text-muted);
        }

        .chat-input-actions {
          display: flex;
          align-items: center;
        }

        .chat-send-button {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .chat-send-button:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }

        .chat-send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-stop-button {
          background: var(--accent-red);
          width: auto;
          padding: 0 1rem;
          border-radius: 1.25rem;
          font-size: 0.875rem;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .chat-stop-button:hover {
          background: #dc2626;
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
        }

        @media (max-width: 768px) {
          .chat-wrapper {
            border-radius: 0;
            border-left: none;
            border-right: none;
          }

          .chat-messages-container {
            padding: 1.5rem 1rem;
          }

          .chat-message-content {
            max-width: 85%;
          }

          .chat-input-area {
            padding: 1rem;
          }

          .chat-new-conversation-wrapper {
            padding: 0 1rem;
          }
        }
      `}</style>
    </div>
  );
}
