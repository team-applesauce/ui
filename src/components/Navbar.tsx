'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, Flame, RefreshCw, RotateCcw } from 'lucide-react';

interface NavbarProps {
  showRefresh?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  lastUpdated?: Date | null;
  children?: React.ReactNode;
  onNewChat?: () => void;
  showNewChat?: boolean;
}

export function Navbar({ 
  showRefresh = false, 
  onRefresh, 
  refreshing = false,
  lastUpdated,
  children,
  onNewChat,
  showNewChat = false
}: NavbarProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const isChatPage = pathname === '/chat';

  return (
    <header className="dashboard-header">
      <div className="dashboard-logo">
        <div className="dashboard-logo-icon">
          {isChatPage ? (
            <MessageSquare className="w-6 h-6 text-white" />
          ) : (
            <Flame className="w-6 h-6 text-white" />
          )}
        </div>
        <div>
          <h1 className="dashboard-title">
            {isChatPage ? 'Watson Orchestrate Chat' : 'WatsonXWatch'}
          </h1>
          <p className="dashboard-subtitle">
            {isChatPage ? 'AI-Powered Assistant' : ''}
            {children}
          </p>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div className="ibm-badge">
          Powered by <span>{isChatPage ? 'IBM Watson' : 'IBM Cloudant'}</span>
        </div>
        
        {showRefresh && onRefresh && (
          <button 
            className="refresh-button" 
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Updating...' : 'Refresh'}
          </button>
        )}
        
        {isHomePage && (
          <Link href="/chat" className="refresh-button" style={{ textDecoration: 'none' }}>
            <MessageSquare className="w-4 h-4" />
            Chat
          </Link>
        )}
        
        {isChatPage && (
          <>
            <Link href="/" className="refresh-button" style={{ textDecoration: 'none' }}>
              <Home className="w-4 h-4" />
              Home
            </Link>
            {showNewChat && onNewChat && (
              <button 
                className="refresh-button" 
                onClick={onNewChat}
                title="Start new conversation"
              >
                <RotateCcw className="w-4 h-4" />
                New Chat
              </button>
            )}
          </>
        )}
        
        {showRefresh && (
          <div className="dashboard-status">
            <span className={`status-indicator ${refreshing ? 'loading' : ''}`}></span>
            <span className="status-text">
              {lastUpdated 
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Live'
              }
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

