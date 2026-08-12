import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';
import { notFound } from 'next/navigation';
import { frameworks } from '../../framework-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return frameworks.map((fw) => ({ slug: fw.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const fw = frameworks.find((f) => f.slug === slug);
  if (!fw) return { title: 'Not Found — MigrationPilot' };
  return {
    title: `${fw.name} Setup Guide — MigrationPilot Docs`,
    description: `How to use MigrationPilot with ${fw.name} migrations. ${fw.description}`,
  };
}

export default async function FrameworkPage({ params }: PageProps) {
  const { slug } = await params;
  const fw = frameworks.find((f) => f.slug === slug);
  if (!fw) notFound();

  return (
    <>
      <Navbar active="docs" />
      <main className="pt-14">
        <article className="mp-container pt-16 md:pt-20 pb-20">
          <a href="/docs" className="text-sm text-muted hover:text-fg transition-colors mb-6 inline-block">&larr; All docs</a>

          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-3xl font-bold">{fw.name}</h1>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-raised text-muted">{fw.language}</span>
          </div>

          <p className="text-muted text-lg mb-10">{fw.description}</p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Auto-Detection</h2>
            <p className="text-muted leading-relaxed">{fw.detectHint}</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Migration Path</h2>
            <p className="text-muted mb-3">Default migration file pattern:</p>
            <CodeBlock code={fw.migrationPath} />
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Setup</h2>
            <CodeBlock code={fw.setup} />
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">GitHub Action</h2>
            <p className="text-muted mb-3">Add to your CI workflow:</p>
            <CodeBlock code={fw.ciExample} />
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Configuration</h2>
            <p className="text-muted mb-3">Add a config file to set the default migration path:</p>
            <CodeBlock code={`# .migrationpilotrc.yml
migrationPath: "${fw.migrationPath}"
failOn: critical`} />
          </section>

          <div className="mt-12 flex items-center gap-4">
            <a href="/docs" className="text-sm text-muted hover:text-fg transition-colors">&larr; All docs</a>
            <a href="/docs/configuration" className="text-sm text-accent hover:text-accent-hover transition-colors">Configuration guide</a>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
