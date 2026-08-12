import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';
import { notFound } from 'next/navigation';
import { providers } from '../../provider-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return providers.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const provider = providers.find((p) => p.slug === slug);
  if (!provider) return { title: 'Not Found — MigrationPilot' };
  return {
    title: `${provider.name} Guide — MigrationPilot Docs`,
    description: `How to use MigrationPilot with ${provider.name}. ${provider.description}`,
  };
}

export default async function ProviderPage({ params }: PageProps) {
  const { slug } = await params;
  const provider = providers.find((p) => p.slug === slug);
  if (!provider) notFound();

  return (
    <>
      <Navbar active="docs" />
      <main className="pt-14">
        <article className="mp-container pt-16 md:pt-20 pb-20">
          <a href="/docs" className="text-sm text-muted hover:text-fg transition-colors mb-6 inline-block">&larr; All docs</a>

          <h1 className="text-3xl font-bold mb-4">{provider.name}</h1>
          <p className="text-muted text-lg mb-10">{provider.description}</p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Connection</h2>
            <p className="text-muted leading-relaxed">{provider.connectionNote}</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Setup</h2>
            <CodeBlock code={provider.setup} />
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-fg">Tips</h2>
            <ul className="space-y-3">
              {provider.tips.map((tip, i) => (
                <li key={i} className="flex gap-3 text-muted">
                  <span className="text-accent mt-1 shrink-0">&#8226;</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
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
