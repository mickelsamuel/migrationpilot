import { Fragment, type ReactNode } from 'react';
import { CodeBlock } from './code-block';
import { rules } from '@/app/rule-data';
import { getHandbookEntries, type Block, type CodeLanguage, type Inline } from '@/lib/handbook';

/**
 * Renders the block tree produced by `lib/handbook.ts`.
 *
 * Two things happen here that the markdown files cannot express on their own.
 * Fenced SQL becomes a real `CodeBlock`, so every statement in the handbook is
 * one click from the clipboard. And bare identifiers in prose — `MP001`,
 * `MPH-004` — become links, but only when the target actually exists, so a
 * renamed rule shows up as plain text rather than a 404.
 */

const CODE_TITLES: Record<CodeLanguage, string> = {
  sql: 'sql',
  bash: 'bash',
  output: 'psql output',
};

const knownRuleIds = new Set(rules.map((rule) => rule.id));

const LINK =
  'text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:text-accent-hover hover:decoration-accent';

/* -------------------------------------------------------------------------- */
/* Inline                                                                     */
/* -------------------------------------------------------------------------- */

const IDENTIFIER = /\b(MP\d{3}|MPH-\d{3})\b/g;

/** `MP001` and `MPH-004` in prose become links to the rule or entry they name. */
function linkifyIdentifiers(text: string): ReactNode {
  const entriesById = new Map(getHandbookEntries().map((entry) => [entry.id, entry.slug]));
  const out: ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(IDENTIFIER)) {
    const id = match[0];
    const href = id.startsWith('MPH-')
      ? entriesById.has(id)
        ? `/handbook/${entriesById.get(id)}`
        : null
      : knownRuleIds.has(id)
        ? `/rules/${id.toLowerCase()}`
        : null;
    if (!href) continue;

    if (match.index! > last) out.push(text.slice(last, match.index));
    out.push(
      <a key={`${id}-${match.index}`} href={href} className={`${LINK} font-mono`}>
        {id}
      </a>,
    );
    last = match.index! + id.length;
  }

  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function renderInline(nodes: Inline[], insideLink = false): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return (
          <Fragment key={index}>{insideLink ? node.text : linkifyIdentifiers(node.text)}</Fragment>
        );
      case 'code':
        return (
          <code
            key={index}
            className="rounded border border-line-soft bg-raised px-[0.3em] py-[0.1em] font-mono text-[0.875em] text-fg"
          >
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-fg">
            {renderInline(node.children, insideLink)}
          </strong>
        );
      case 'em':
        return (
          <em key={index} className="italic">
            {renderInline(node.children, insideLink)}
          </em>
        );
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            className={LINK}
            {...(node.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {renderInline(node.children, true)}
          </a>
        );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function renderBlock(block: Block, key: number, nested: boolean): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3';
      return (
        <Tag
          key={key}
          id={block.id}
          className={
            block.level === 2
              ? 'mt-14 scroll-mt-24 border-t border-line-soft pt-10 text-xl font-semibold text-fg sm:text-2xl'
              : 'mt-10 scroll-mt-24 text-[17px] font-semibold text-fg'
          }
        >
          {renderInline(block.children)}
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p
          key={key}
          className={
            nested
              ? 'text-[15px] leading-[1.7] text-muted'
              : 'mt-5 text-[15px] leading-[1.75] text-muted sm:text-base'
          }
        >
          {renderInline(block.children)}
        </p>
      );

    case 'code':
      return (
        <CodeBlock
          key={key}
          code={block.code}
          title={CODE_TITLES[block.language]}
          language={block.language === 'sql' ? 'sql' : 'plain'}
          className="mt-6"
        />
      );

    case 'quote':
      return (
        <blockquote
          key={key}
          className="mt-6 space-y-4 border-l-2 border-line bg-surface py-4 pl-5 pr-4 [&>p]:mt-0 [&>p]:text-[15px]"
        >
          {block.children.map((child, index) => renderBlock(child, index, true))}
        </blockquote>
      );

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          key={key}
          className={`mt-5 space-y-2.5 pl-5 marker:text-faint ${
            block.ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1.5 [&>*+*]:mt-3">
              {item.map((child, childIndex) => renderBlock(child, childIndex, true))}
            </li>
          ))}
        </Tag>
      );
    }

    case 'table':
      return (
        // Wide tables scroll inside this box; the page itself never scrolls
        // sideways, on any width.
        <div key={key} className="mp-scroll mt-6 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="bg-raised">
                {block.head.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="border-b border-line px-4 py-2.5 text-[13px] font-medium text-fg"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line-soft last:border-b-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-4 py-2.5 align-top text-[13px] leading-relaxed text-muted"
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function HandbookMarkdown({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((block, index) => renderBlock(block, index, false))}</>;
}

/** Inline nodes on their own, for the one-line hooks on the index. */
export function HandbookInline({ nodes }: { nodes: Inline[] }) {
  return <>{renderInline(nodes, true)}</>;
}
