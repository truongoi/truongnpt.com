import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import settings from '../site-settings.json';

export async function GET(context) {
  const posts = (await getCollection('posts', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  return rss({
    title: settings.siteTitle,
    description: settings.siteDescription,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/p/${post.id}/`,
    })),
  });
}
