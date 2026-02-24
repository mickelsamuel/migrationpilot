import type { Metadata } from 'next';
import { blogPosts } from './blog-data';

export const metadata: Metadata = {
  title: 'Blog — MigrationPilot',
  description: 'Technical guides on PostgreSQL migrations, locking, schema changes, and zero-downtime deployments. Written by engineers, for engineers.',
  keywords: ['postgresql blog', 'database migration blog', 'postgresql locks', 'schema migration guide'],
  alternates: {
    canonical: '/blog',
  },
};

export default function BlogIndex() {
  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/blog" className="text-white font-medium">Blog</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Blog</h1>
          <p className="text-xl text-slate-400 mb-16">
            Technical guides on PostgreSQL migrations, locking behavior, and zero-downtime schema changes.
          </p>

          <div className="space-y-8">
            {blogPosts.map((post) => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block p-6 rounded-xl border border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/60 transition-all group"
              >
                <div className="flex items-center gap-3 text-sm text-slate-500 mb-3">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </time>
                  <span className="w-1 h-1 rounded-full bg-slate-700" />
                  <span>{post.readingTime}</span>
                </div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {post.description}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-xs">MP</div>
            <span className="text-sm text-slate-400">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
            <a href="https://www.npmjs.com/package/migrationpilot" className="hover:text-slate-300 transition-colors">npm</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
