import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';
import { notFound } from 'next/navigation';
import { docs } from '../docs-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return docs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return { title: 'Not Found — MigrationPilot' };
  return {
    title: `${doc.title} — MigrationPilot Docs`,
    description: doc.description,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) notFound();

  const currentIndex = docs.findIndex((d) => d.slug === slug);
  const prev = currentIndex > 0 ? docs[currentIndex - 1] : undefined;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : undefined;

  return (
    <>
      <Navbar active="docs" />
      <main className="pt-14">
        <article className="mp-container pt-16 md:pt-20 pb-20">
          <a href="/docs" className="text-sm text-muted hover:text-fg transition-colors mb-6 inline-block">&larr; All docs</a>

          <h1 className="text-3xl font-bold mb-4">{doc.title}</h1>
          <p className="text-muted text-lg mb-10">{doc.description}</p>

          {doc.sections.map((section, i) => (
            <section key={i} className="mb-10">
              <h2 className="text-xl font-semibold mb-3 text-fg">{section.heading}</h2>
              <p className="text-muted leading-relaxed mb-4">{section.content}</p>
              {section.code && (
                <CodeBlock code={section.code} />
              )}
            </section>
          ))}

          <div className="mt-12 flex items-center justify-between border-t border-line-soft pt-6">
            {prev ? (
              <a href={`/docs/${prev.slug}`} className="text-sm text-muted hover:text-fg transition-colors">
                &larr; {prev.title}
              </a>
            ) : <span />}
            {next ? (
              <a href={`/docs/${next.slug}`} className="text-sm text-accent hover:text-accent-hover transition-colors">
                {next.title} &rarr;
              </a>
            ) : <span />}
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
