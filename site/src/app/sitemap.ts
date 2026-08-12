import type { MetadataRoute } from 'next';
import { rules } from './rule-data';
import { blogPosts } from './blog/blog-data';
import { docs } from './docs/docs-data';
import { frameworks } from './docs/framework-data';
import { providers } from './docs/provider-data';
import { getHandbookEntries } from '@/lib/handbook';

const BASE = 'https://migrationpilot.dev';

// Every page is derived from the data files that drive the pages themselves, so
// adding a rule, blog post, framework, or provider updates the sitemap for free.
export default function sitemap(): MetadataRoute.Sitemap {
  const buildDate = new Date();

  const staticPages: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
  }> = [
    { path: '', changeFrequency: 'weekly', priority: 1.0 },
    { path: '/pricing', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/rules', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/benchmark', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/handbook', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/docs', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/blog', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/playground', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/changelog', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/billing', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  ];

  const comparePages = ['atlas', 'flyway', 'liquibase', 'squawk'];
  const migratePages = ['atlas', 'bytebase', 'flyway', 'liquibase', 'squawk'];

  return [
    ...staticPages.map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified: buildDate,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),

    ...comparePages.map((slug) => ({
      url: `${BASE}/compare/${slug}`,
      lastModified: buildDate,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),

    ...migratePages.map((slug) => ({
      url: `${BASE}/migrate-from-${slug}`,
      lastModified: buildDate,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),

    ...docs.map((doc) => ({
      url: `${BASE}/docs/${doc.slug}`,
      lastModified: buildDate,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),

    ...frameworks.map((fw) => ({
      url: `${BASE}/docs/frameworks/${fw.slug}`,
      lastModified: buildDate,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),

    ...providers.map((p) => ({
      url: `${BASE}/docs/providers/${p.slug}`,
      lastModified: buildDate,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),

    // Blog posts carry their real publish date rather than the build date.
    ...blogPosts.map((post) => ({
      url: `${BASE}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),

    // One page per handbook entry, carrying the entry's own last_verified date
    // rather than the build date — that is the date the claims were checked.
    ...getHandbookEntries().map((entry) => ({
      url: `${BASE}/handbook/${entry.slug}`,
      lastModified: new Date(entry.lastVerified),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),

    // One page per rule, derived from rule-data so the count follows the engine.
    ...rules.map((rule) => ({
      url: `${BASE}/rules/${rule.id.toLowerCase()}`,
      lastModified: buildDate,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
