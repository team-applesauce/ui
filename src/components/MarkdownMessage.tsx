'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
}

function CodeBlock({ language, children }: { language: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="md-code-block-wrapper">
      <div className="md-code-block-header">
        {language && (
          <span className="md-code-block-lang">{language}</span>
        )}
        <button
          onClick={handleCopy}
          className="md-code-copy-btn"
          title="Copy code"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="md-code-block">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="md-h1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="md-h2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="md-h3">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="md-h4">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="md-h5">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="md-h6">{children}</h6>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="md-p">{children}</p>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="md-ul">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="md-ol">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="md-li">{children}</li>
          ),

          // Code blocks
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (inline) {
              return (
                <code className="md-code-inline" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={language}>
                {children}
              </CodeBlock>
            );
          },

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="md-blockquote">
              {children}
            </blockquote>
          ),

          // Links
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="md-link"
            >
              {children}
            </a>
          ),

          // Tables
          table: ({ children }) => (
            <div className="md-table-wrapper">
              <table className="md-table">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="md-thead">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="md-tbody">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="md-tr">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="md-th">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="md-td">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="md-hr" />
          ),

          // Strong and emphasis
          strong: ({ children }) => (
            <strong className="md-strong">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="md-em">{children}</em>
          ),

          // Images
          img: ({ src, alt }) => (
            <img 
              src={src || ''} 
              alt={alt || ''} 
              className="md-img"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
