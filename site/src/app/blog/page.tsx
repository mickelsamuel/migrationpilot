import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { blogPosts } from './blog-data';

export const metadata: Metadata = {
  title: 'Blog: MigrationPilot',
  description:
    'Technical guides on PostgreSQL migrations, locking, schema changes, and zero-downtime deployments. Written by engineers, for engineers.',
  keywords: ['postgresql blog', 'database migration blog', 'postgresql locks', 'schema migration guide'],
  alternates: {
    canonical: '/blog',
  },
};

export default function BlogIndex() {
  return (
    <>
      <Navbar active="blog" />
      <main className="pt-14">
        <section className="mp-container pb-4 pt-16 md:pt-20">
          <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[40px]">
            Blog
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            What PostgreSQL actually does when you change a schema under load: which lock each
            statement takes, how long it holds it, and the rewrite that avoids the outage.
          </p>
        </section>

        <section className="mp-container pb-20 pt-10">
          <ul className="max-w-3xl divide-y divide-line-soft border-t border-line-soft">
            {blogPosts.map((post) => (
              <li key={post.slug}>
                <a href={`/blog/${post.slug}`} className="group block py-6">
                  <div className="flex items-center gap-3 font-mono text-xs text-faint">
                    <time dateTime={post.date}>
                      {new Date(post.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                    <span aria-hidden className="h-1 w-1 rounded-full bg-line" />
                    <span>{post.readingTime}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-medium text-fg transition-colors group-hover:text-accent">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{post.description}</p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
