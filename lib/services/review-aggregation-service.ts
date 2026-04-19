import { summaryService } from "./ai-service";

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
    
    1. **Google Reviews**: Search for "${businessName} Google Reviews" or "${businessName} reviews"
       - Check Google Maps reviews specifically for this business
       - Look for reviews mentioning their products, services, customer experience
    
    2. **Yelp Reviews**: Search for "${businessName} Yelp" or "${businessName} reviews on Yelp"
       - Focus on location-specific Yelp reviews for this business type
       - Look for reviews mentioning quality, pricing, service, experience
    
    3. **Reddit**: Search Reddit for "${businessName}" or "${businessName} reviews" or "${businessName} experience"
       - Check local city/region subreddits (e.g., r/[cityname], r/[statename])
       - Check industry-specific subreddits related to their business type
       - Look for genuine customer experiences and opinions
    
    4. **Twitter/X**: Search for "${businessName}" tweets and mentions
       - Look for customer feedback, complaints, or praise
       - Check if they have any recent promotions or customer interactions
    
    5. **Facebook/Instagram**: Search for "${businessName}" social media
       - Check their Facebook page reviews if available
       - Look at Instagram posts and comments about this business
       - Search for location-tagged posts about this business
    
    For each source, note:
    - Source name (Google, Yelp, Reddit, Twitter, Instagram, Facebook)
    - Rating if available (1-5 stars)
    - Key points from the review (positive and negative)
    - Date of the review if visible
    - Specific mentions of products, services, pricing, customer experience
    
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

    const { content } = await summaryService.generateResponse([
      { role: "system", content: "You are a research assistant specializing in finding and analyzing customer reviews. Aggregate reviews from multiple sources and identify patterns. Always respond with valid JSON only." },
      { role: "user", content: prompt }
    ], 0.3, 5000, "summary");

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
