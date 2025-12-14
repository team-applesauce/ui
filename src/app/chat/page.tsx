'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, RotateCcw, Wrench, Sparkles, Copy, Check } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { MarkdownMessage } from '@/components/MarkdownMessage';

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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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

    // Create assistant message ID before try block so it's accessible in catch
    const assistantMessageId = (Date.now() + 1).toString();

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

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } else {
        // Fallback for older browsers or HTTP
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
          } else {
            throw new Error('Copy command failed');
          }
        } catch (err) {
          console.error('Fallback copy failed:', err);
          // Show user-friendly error
          alert('Failed to copy to clipboard. Please select and copy manually.');
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for clipboard API errors
      try {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        if (successful) {
          setCopiedMessageId(messageId);
          setTimeout(() => setCopiedMessageId(null), 2000);
        } else {
          alert('Failed to copy to clipboard. Please select and copy manually.');
        }
        document.body.removeChild(textArea);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
        alert('Failed to copy to clipboard. Please select and copy manually.');
      }
    }
  };

  return (
    <div className="chat-page-container">
      {/* Header */}
      <div className="chat-header-wrapper">
        <Navbar
          onNewChat={handleNewConversation}
          showNewChat={!!threadId}
        >
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
      </div>

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
                  {message.content ? (
                    message.role === 'assistant' ? (
                      <MarkdownMessage content={message.content} />
                    ) : (
                      message.content
                    )
                  ) : message.role === 'assistant' && isLoading ? (
                    <span className="chat-typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  ) : null}
                  {message.content && (
                    <button
                      onClick={() => handleCopyMessage(message.id, message.content)}
                      className="chat-message-copy-btn"
                      title="Copy message"
                      aria-label="Copy message to clipboard"
                    >
                      {copiedMessageId === message.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  )}
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
          padding: 0;
          box-sizing: border-box;
        }

        .chat-header-wrapper {
          flex-shrink: 0;
        }

        .chat-header-wrapper :global(.dashboard-header) {
          margin-bottom: 0;
          border-bottom: 1px solid var(--border-primary);
        }

        .chat-wrapper {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          width: 100%;
          background: var(--bg-primary);
          overflow: hidden;
        }

        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-width: 100%;
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
          background: var(--bg-card);
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
          gap: 0.75rem;
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
          background: var(--accent-blue);
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
          max-width: 85%;
        }

        .chat-message-user .chat-message-content {
          text-align: right;
          max-width: fit-content;
          margin-left: auto;
        }

        .chat-message-text {
          padding: 0.625rem 0.875rem;
          border-radius: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          color: var(--text-primary);
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          transition: all 0.2s ease;
          font-size: 0.95rem;
          display: inline-block;
          position: relative;
        }

        .chat-message-user .chat-message-text {
          background: var(--accent-blue);
          color: white;
          border: none;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
          max-width: 100%;
          width: fit-content;
          min-width: auto;
        }

        .chat-message-assistant .chat-message-text {
          background: var(--bg-card);
          border-color: var(--border-primary);
        }

        .chat-message-assistant .chat-message-text .md-content {
          font-size: inherit;
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

        .chat-message-copy-btn {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          padding: 0.375rem;
          background: var(--bg-card);
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          z-index: 10;
          min-width: 28px;
          min-height: 28px;
        }

        .chat-message-text:hover .chat-message-copy-btn,
        .chat-message-text:focus-within .chat-message-copy-btn {
          opacity: 1;
        }

        @media (max-width: 768px) {
          .chat-message-copy-btn {
            opacity: 0.7;
          }

          .chat-message-text:active .chat-message-copy-btn {
            opacity: 1;
          }
        }

        .chat-message-copy-btn:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
          transform: scale(1.05);
        }

        .chat-message-copy-btn:active {
          transform: scale(0.95);
        }

        .chat-message-user .chat-message-copy-btn {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
        }

        .chat-message-user .chat-message-copy-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.4);
          color: white;
        }

        .chat-message-time {
          font-size: 0.7rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
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
          margin: 1rem 1.5rem;
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
          padding: 0.75rem 1rem;
          border-top: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .chat-input-wrapper {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
          background: var(--bg-card);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 0.5rem 0.75rem;
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
          background: var(--accent-blue);
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

        /* Professional Markdown Styles */
        .md-content {
          line-height: 1.75;
          color: var(--text-primary);
          font-size: 0.95rem;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .md-content > *:first-child {
          margin-top: 0 !important;
        }

        .md-content > *:last-child {
          margin-bottom: 0 !important;
        }

        /* Headings */
        .md-h1 {
          font-size: 2.25rem !important;
          font-weight: 700 !important;
          margin: 1.25rem 0 0.75rem 0 !important;
          color: var(--text-primary) !important;
          line-height: 1.2;
          border-bottom: 2px solid var(--border-primary);
          padding-bottom: 0.5rem;
          letter-spacing: -0.02em;
        }

        .md-h2 {
          font-size: 1.75rem !important;
          font-weight: 600 !important;
          margin: 1rem 0 0.625rem 0 !important;
          color: var(--text-primary) !important;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }

        .md-h3 {
          font-size: 1.5rem !important;
          font-weight: 600 !important;
          margin: 0.875rem 0 0.5rem 0 !important;
          color: var(--text-primary) !important;
          line-height: 1.4;
        }

        .md-h4 {
          font-size: 1.125rem !important;
          font-weight: 600 !important;
          margin: 0.625rem 0 0.375rem 0 !important;
          color: var(--text-primary) !important;
        }

        .md-h5 {
          font-size: 1rem !important;
          font-weight: 600 !important;
          margin: 0.5rem 0 0.25rem 0 !important;
          color: var(--text-primary) !important;
        }

        .md-h6 {
          font-size: 0.875rem !important;
          font-weight: 600 !important;
          margin: 0.5rem 0 0.25rem 0 !important;
          color: var(--text-secondary) !important;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Paragraphs */
        .md-p {
          margin: 0.625rem 0 !important;
          color: var(--text-primary) !important;
          line-height: 1.75;
        }

        /* Lists */
        .md-ul,
        .md-ol {
          margin: 0.625rem 0 !important;
          padding-left: 1.75rem !important;
          color: var(--text-primary) !important;
        }

        .md-ul {
          list-style-type: disc !important;
        }

        .md-ul .md-ul {
          list-style-type: circle !important;
        }

        .md-ul .md-ul .md-ul {
          list-style-type: square !important;
        }

        .md-ol {
          list-style-type: decimal !important;
        }

        .md-li {
          margin: 0.375rem 0 !important;
          line-height: 1.7;
          color: var(--text-primary) !important;
          padding-left: 0.25rem;
        }

        .md-li::marker {
          color: var(--accent-cyan);
        }

        .md-ul .md-ul,
        .md-ol .md-ol,
        .md-ul .md-ol,
        .md-ol .md-ul {
          margin: 0.25rem 0 !important;
        }

        /* Code */
        .md-code-inline {
          background: rgba(6, 182, 212, 0.12) !important;
          border: 1px solid rgba(6, 182, 212, 0.25);
          border-radius: 4px;
          padding: 0.2rem 0.5rem;
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace !important;
          font-size: 0.9em !important;
          color: var(--accent-cyan) !important;
          font-weight: 500;
          display: inline-block;
        }

        .md-code-block-wrapper {
          margin: 1rem 0;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .md-code-block-wrapper:hover {
          border-color: var(--border-glow);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .md-code-block-header {
          background: var(--bg-card);
          border-bottom: 1px solid var(--border-primary);
          padding: 0.625rem 0.875rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace;
        }

        .md-code-block-lang {
          color: var(--accent-cyan);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 0.7rem;
        }

        .md-code-copy-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.625rem;
          background: transparent;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 0.7rem;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
        }

        .md-code-copy-btn:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
        }

        .md-code-copy-btn:active {
          transform: scale(0.95);
        }

        .md-code-block {
          margin: 0 !important;
          padding: 1.125rem !important;
          background: var(--bg-secondary) !important;
          border: none !important;
          border-radius: 0 !important;
          overflow-x: auto;
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace !important;
          position: relative;
        }

        .md-code-block code {
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace !important;
          font-size: 0.875rem !important;
          line-height: 1.7 !important;
          color: var(--text-primary) !important;
          background: transparent !important;
          padding: 0 !important;
          border: none !important;
          display: block;
        }

        /* Blockquotes */
        .md-blockquote {
          border-left: 4px solid var(--accent-blue);
          padding: 0.875rem 1.125rem;
          margin: 0.875rem 0;
          background: rgba(59, 130, 246, 0.08);
          border-radius: 0 8px 8px 0;
          color: var(--text-secondary);
          font-style: italic;
          position: relative;
        }

        .md-blockquote::before {
          content: '"';
          position: absolute;
          left: 0.5rem;
          top: 0.5rem;
          font-size: 2rem;
          color: var(--accent-blue);
          opacity: 0.3;
          font-family: serif;
        }

        .md-blockquote p {
          margin: 0 !important;
          position: relative;
          z-index: 1;
        }

        /* Links */
        .md-link {
          color: var(--accent-blue) !important;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .md-link:hover {
          color: var(--accent-cyan) !important;
          border-bottom-color: var(--accent-cyan);
        }

        /* Tables */
        .md-table-wrapper {
          overflow-x: auto;
          margin: 1rem 0;
          border-radius: 10px;
          border: 1px solid var(--border-primary);
          background: var(--bg-card);
          -webkit-overflow-scrolling: touch;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .md-table {
          width: 100%;
          min-width: 100%;
          border-collapse: collapse;
          background: var(--bg-card);
          font-size: 0.875rem;
        }

        .md-thead {
          background: var(--bg-secondary);
        }

        .md-th {
          padding: 0.875rem 1.125rem;
          text-align: left;
          font-weight: 600;
          color: var(--text-primary);
          border-bottom: 2px solid var(--border-primary);
          background: var(--bg-secondary);
          position: sticky;
          top: 0;
          z-index: 10;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        .md-td {
          padding: 0.875rem 1.125rem;
          border-bottom: 1px solid var(--border-primary);
          color: var(--text-primary);
          vertical-align: top;
          word-wrap: break-word;
          max-width: 500px;
          line-height: 1.6;
        }

        .md-tr:last-child .md-td {
          border-bottom: none;
        }

        .md-tbody .md-tr:nth-child(even) {
          background: rgba(0, 0, 0, 0.12);
        }

        .md-tbody .md-tr:hover {
          background: rgba(59, 130, 246, 0.1);
          transition: background 0.15s ease;
        }

        /* Horizontal Rule */
        .md-hr {
          border: none;
          border-top: 1px solid var(--border-primary);
          margin: 1rem 0;
        }

        /* Strong and Emphasis */
        .md-strong {
          font-weight: 600;
          color: var(--text-primary);
        }

        .md-em {
          font-style: italic;
          color: var(--text-primary);
        }

        /* Images */
        .md-img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 0.75rem 0;
          border: 1px solid var(--border-primary);
        }

        @media (max-width: 768px) {
          .chat-messages-container {
            padding: 1rem;
          }

          .chat-message-content {
            max-width: 90%;
          }

          .chat-message-text {
            font-size: 0.9rem;
          }

          .chat-input-area {
            padding: 0.75rem 1rem;
          }

          .md-h1 {
            font-size: 1.75rem !important;
            margin: 1rem 0 0.625rem 0 !important;
          }

          .md-h2 {
            font-size: 1.5rem !important;
            margin: 0.875rem 0 0.5rem 0 !important;
          }

          .md-h3 {
            font-size: 1.25rem !important;
            margin: 0.75rem 0 0.5rem 0 !important;
          }

          .md-code-block {
            padding: 0.875rem !important;
            font-size: 0.8rem !important;
          }

          .md-code-block-header {
            padding: 0.5rem 0.75rem;
          }

          .md-code-copy-btn {
            padding: 0.25rem 0.5rem;
            font-size: 0.65rem;
          }

          .md-table-wrapper {
            font-size: 0.8rem;
            margin: 0.75rem 0;
          }

          .md-th,
          .md-td {
            padding: 0.625rem 0.75rem;
            font-size: 0.8rem;
          }

          .md-th {
            font-size: 0.75rem;
          }

          .md-blockquote {
            padding: 0.75rem 1rem;
          }
        }
      `}</style>
    </div>
  );
}
