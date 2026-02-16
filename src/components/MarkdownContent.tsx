import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownContentProps {
  content: string;
}

/**
 * Render markdown content with syntax highlighting for code blocks.
 * Used for AI responses to properly display formatted content.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
}: MarkdownContentProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Code blocks with syntax highlighting
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !className;

          if (isInline) {
            return (
              <code
                className="rounded bg-theme-tertiary px-1.5 py-0.5 text-sm font-mono text-pink-400"
                {...props}
              >
                {children}
              </code>
            );
          }

          return (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match ? match[1] : "text"}
              PreTag="div"
              className="rounded-md text-sm"
              customStyle={{
                margin: "0.5rem 0",
                padding: "1rem",
                borderRadius: "0.375rem",
                backgroundColor: "#1e1e1e",
              }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          );
        },
        // Links open in new tab
        a({ href, children, ...props }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
              {...props}
            >
              {children}
            </a>
          );
        },
        // Styled headings
        h1({ children, ...props }) {
          return (
            <h1 className="text-xl font-bold text-theme-primary mt-4 mb-2" {...props}>
              {children}
            </h1>
          );
        },
        h2({ children, ...props }) {
          return (
            <h2 className="text-lg font-bold text-theme-primary mt-3 mb-2" {...props}>
              {children}
            </h2>
          );
        },
        h3({ children, ...props }) {
          return (
            <h3 className="text-base font-semibold text-theme-secondary mt-2 mb-1" {...props}>
              {children}
            </h3>
          );
        },
        // Lists
        ul({ children, ...props }) {
          return (
            <ul className="list-disc list-inside my-2 space-y-1 text-sm text-theme-secondary" {...props}>
              {children}
            </ul>
          );
        },
        ol({ children, ...props }) {
          return (
            <ol className="list-decimal list-inside my-2 space-y-1 text-sm text-theme-secondary" {...props}>
              {children}
            </ol>
          );
        },
        // Paragraphs
        p({ children, ...props }) {
          return (
            <p className="my-2 text-sm text-theme-primary leading-relaxed" {...props}>
              {children}
            </p>
          );
        },
        // Blockquotes
        blockquote({ children, ...props }) {
          return (
            <blockquote
              className="border-l-4 border-theme-primary pl-4 my-2 italic text-theme-muted"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        // Horizontal rule
        hr(props) {
          return <hr className="my-4 border-theme-primary" {...props} />;
        },
        // Strong/bold
        strong({ children, ...props }) {
          return (
            <strong className="font-semibold text-theme-primary" {...props}>
              {children}
            </strong>
          );
        },
        // Emphasis/italic
        em({ children, ...props }) {
          return (
            <em className="italic text-theme-secondary" {...props}>
              {children}
            </em>
          );
        },
        // Tables
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border border-theme-primary" {...props}>
                {children}
              </table>
            </div>
          );
        },
        thead({ children, ...props }) {
          return (
            <thead className="bg-theme-tertiary" {...props}>
              {children}
            </thead>
          );
        },
        tbody({ children, ...props }) {
          return (
            <tbody className="bg-theme-secondary" {...props}>
              {children}
            </tbody>
          );
        },
        tr({ children, ...props }) {
          return (
            <tr className="border-b border-theme-primary" {...props}>
              {children}
            </tr>
          );
        },
        th({ children, ...props }) {
          return (
            <th className="px-3 py-2 text-left text-sm font-semibold text-theme-secondary border-b border-theme-primary" {...props}>
              {children}
            </th>
          );
        },
        td({ children, ...props }) {
          return (
            <td className="px-3 py-2 text-sm text-theme-secondary border-b border-theme-primary" {...props}>
              {children}
            </td>
          );
        },
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
