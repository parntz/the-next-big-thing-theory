import { analysisService } from "./ai-service";

interface Review {
  source: string;
  rating: number;
  text: string;
  author?: string;
  date: string;
}

interface ReviewAggregationResult {
  success: boolean;
  reviews: Review[];
  aggregatedRating?: number;
  summary: string;
  error?: string;
}

/**
 * Aggregate reviews from multiple sources:
 * - Google Places (via scraping)
 * - Yelp (via scraping)
 * - Reddit (via scraping)
 * - Twitter/X (via scraping)
 * - General web reviews
 */
export async function aggregateReviews(
  businessName: string,
  websiteUrl: string
): Promise<ReviewAggregationResult> {
  console.log(`[ReviewAgg] Starting review aggregation for ${businessName}`);
  
  try {
    const prompt = `Find and analyze customer reviews for "${businessName}" (${websiteUrl}).

    Search multiple sources and compile reviews:
    
    1. **Google Reviews**: Search for "[Business Name] Google Reviews" or "[Business Name] reviews Google"
    
    2. **Yelp Reviews**: Search for "[Business Name] Yelp" or "[Business Name] reviews on Yelp"
    
    3. **Reddit**: Search Reddit for discussions about "[Business Name]" or "[Business Name] reviews" or "[Business Name] experience"
       - Check subreddits like r/Ecommerce, r/Entrepreneur, r/SmallBusiness, or niche subreddits related to their industry
       - Look for genuine customer experiences and opinions
    
    4. **Twitter/X**: Search for "[Business Name]" tweets and mentions
    
    5. **General Web**: Any other review platforms or news articles mentioning them
    
    For each source, note:
    - Source name (Google, Yelp, Reddit, Twitter, etc.)
    - Rating if available (1-5 stars)
    - Key points from the review (positive and negative)
    - Date of the review if visible
    
    Compile a comprehensive JSON response:
    {
      "reviews": [
        {
          "source": "google/yelp/reddit/twitter/web",
          "rating": 4,
          "text": "Key quote or summary of what they said...",
          "author": "Reviewer name or Anonymous",
          "date": "2024-01-15 or '2 months ago' or '2024'"
        }
      ],
      "aggregatedRating": 4.2,
      "summary": "Overall customer sentiment summary - what are people praising? Complaining about?"
    }
    
    Focus on finding actual customer reviews and experiences. Look for patterns in what customers love and what they hate.`;

    const { content } = await analysisService.generateResponse([
      { role: "system", content: "You are a research assistant specializing in finding and analyzing customer reviews from multiple online sources." },
      { role: "user", content: prompt }
    ], 0.3, 3000);

    const result = JSON.parse(content);
    console.log(`[ReviewAgg] Found ${result.reviews?.length || 0} reviews`);
    
    return {
      success: true,
      reviews: result.reviews || [],
      aggregatedRating: result.aggregatedRating,
      summary: result.summary || "No summary available"
    };
  } catch (error) {
    console.error(`[ReviewAgg] Error aggregating reviews:`, error);
    return {
      success: false,
      reviews: [],
      summary: "Failed to aggregate reviews",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Format reviews for inclusion in analysis prompts
 */
export function formatReviewsForPrompt(reviews: Review[], businessName: string): string {
  if (!reviews || reviews.length === 0) {
    return `No customer reviews found for ${businessName}`;
  }
  
  const bySource = reviews.reduce((acc, review) => {
    acc[review.source] = acc[review.source] || [];
    acc[review.source].push(review);
    return acc;
  }, {} as Record<string, Review[]>);
  
  let formatted = `\n\n## Customer Reviews for ${businessName}\n`;
  
  for (const [source, sourceReviews] of Object.entries(bySource)) {
    const ratings = sourceReviews.filter(r => r.rating).map(r => r.rating);
    const avgRating = ratings.length > 0 
      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
      : "N/A";
    
    formatted += `\n### ${source.charAt(0).toUpperCase() + source.slice(1)} (Avg Rating: ${avgRating}★)\n`;
    
    for (const review of sourceReviews.slice(0, 5)) { // Max 5 per source
      formatted += `- ${review.rating ? `${review.rating}★: ` : ""}"${review.text}"`;
      if (review.author) formatted += ` - ${review.author}`;
      if (review.date) formatted += ` (${review.date})`;
      formatted += "\n";
    }
  }
  
  return formatted;
}

/**
 * Get sentiment analysis for competitor comparison
 */
export async function getCompetitorReviewInsights(
  competitors: Array<{name: string, websiteUrl: string}>
): Promise<Map<string, ReviewAggregationResult>> {
  const results = new Map<string, ReviewAggregationResult>();
  
  console.log(`[ReviewAgg] Getting review insights for ${competitors.length} competitors`);
  
  for (const competitor of competitors) {
    const result = await aggregateReviews(competitor.name, competitor.websiteUrl);
    results.set(competitor.name, result);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  console.log(`[ReviewAgg] Completed competitor review analysis`);
  return results;
}
