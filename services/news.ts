export interface Article {
    id: string;
    title: string;
    category: string;
    image: string;
    time: string;
    url: string;
    description?: string;
    featured?: boolean;
}

const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json?rss_url=';
// Google News RSS for "Medio Ambiente Chile"
const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search?q=medio+ambiente+chile&hl=es-419&gl=CL&ceid=CL:es-419';

export const fetchNews = async (): Promise<Article[]> => {
    try {
        const response = await fetch(`${RSS2JSON_API}${encodeURIComponent(GOOGLE_NEWS_RSS)}`);
        const data = await response.json();

        if (data.status === 'ok') {
            return data.items.map((item: any) => {
                // Extract connection to image if available in content or description (Google RSS often hides it)
                // For fallback, we'll use a placeholder or try to extract from description
                const imageMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
                const image = imageMatch ? imageMatch[1] : `https://picsum.photos/seed/${item.guid}/400/300`;

                return {
                    id: item.guid,
                    title: item.title,
                    category: 'Noticias', // RSS doesn't always give clean categories
                    image: image,
                    time: new Date(item.pubDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                    url: item.link,
                    description: item.description,
                    featured: false
                };
            });
        } else {
            console.error("Error fetching news:", data.message);
            return [];
        }
    } catch (error) {
        console.error("News fetch error:", error);
        return [];
    }
};
