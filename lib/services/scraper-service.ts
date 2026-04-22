import { summaryService } from "./ai-service";

interface ScrapeResult {
  success: boolean;
  content: {
    title: string;
    description: string;
    mainProducts: string[];
    pricing: string;
    brandStory: string;
    uniqueSellingPoints: string[];
    targetMarket: string;
    socialMedia: Record<string, string>;
    recentReviews: Array<{
      source: string;
      rating: number;
      text: string;
      date: string;
    }>;
    strengths?: string[];
    weaknesses?: string[];
  };
  error?: string;
}

export async function scrapeWebsite(url: string, siteName: string, businessContext?: string): Promise<ScrapeResult> {
  console.log(`[Scraper] Starting deep dive into ${siteName} (${url})`);

  try {
    const contextSection = businessContext ? `
IMPORTANT CONTEXT - This is what this business claims to be. Use this to interpret what you find on the website:
${businessContext}

` : '';

    const prompt = `You are a research assistant. Visit and thoroughly analyze the website: ${url}

${contextSection}Conduct a DEEP analysis covering:
    
    1. **Homepage Analysis**: What is this business? What do they sell? What are their main product categories?
    
    2. **Products & Pricing**: What products do they offer? What are their price ranges? What is their value proposition?
    
    3. **Brand Story**: Who founded this company? What's their mission? What values do they emphasize?
    
    4. **Unique Selling Points**: What makes them different from competitors? What do they emphasize as their competitive advantage?
    
    5. **Target Market**: Who is their ideal customer? What demographics do they serve?
    
    6. **Social Media Presence**: What social media platforms are they on? How active are they?
    
    7. **Customer Reviews & Sentiment**: What do customers say? What are the common praises? Complaints?
    
    8. **Competitor Intelligence**: What keywords do they rank for? What ads do they run? What's their content strategy?
    
    Return a comprehensive JSON report with this exact structure:
    {
      "title": "Business name",
      "description": "2-3 sentence description of what they do",
      "mainProducts": ["product1", "product2", "..."],
      "pricing": "Price range description (e.g., '$50-200')",
      "brandStory": "Brief brand history and mission",
      "uniqueSellingPoints": ["point1", "point2", "..."],
      "targetMarket": "Description of ideal customer",
      "socialMedia": {
        "instagram": "url or N/A",
        "twitter": "url or N/A", 
        "facebook": "url or N/A",
        "tiktok": "url or N/A"
      },
      "recentReviews": [
        {
          "source": "google/yelp/reddit/social",
          "rating": 4,
          "text": "Review snippet...",
          "date": "2024 or relative"
        }
      ],
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1", "weakness2"]
    }
    
    Be thorough - check their about page, products page, blog, and any review sections visible.`;

    const { content } = await summaryService.generateResponse([
      { role: "system", content: "You are an expert web researcher. Analyze websites thoroughly and provide detailed, accurate information in valid JSON format. Always respond with valid JSON only." },
      { role: "user", content: prompt }
    ], 0.3, 6000, "summary");

    const result = JSON.parse(content);
    console.log(`[Scraper] Completed deep dive for ${siteName}`);
    
    return {
      success: true,
      content: result
    };
  } catch (error) {
    console.error(`[Scraper] Error scraping ${url}:`, error);
    return {
      success: false,
      content: {
        title: siteName,
        description: "Failed to analyze",
        mainProducts: [],
        pricing: "Unknown",
        brandStory: "",
        uniqueSellingPoints: [],
        targetMarket: "",
        socialMedia: {},
        recentReviews: []
      },
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Checks if a URL is actually live and returns a valid HTTP response.
 * Returns true if URL responds with 200-399 status code.
 */
export async function checkUrlLive(url: string): Promise<{ isLive: boolean; statusCode: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CompetitorValidator/1.0)"
      }
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok || response.status < 400) {
      return { isLive: true, statusCode: response.status };
    }
    
    return { isLive: false, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // Handle specific error types
    if (errorMessage.includes("abort")) {
      return { isLive: false, statusCode: 0, error: "Timeout" };
    }
    if (errorMessage.includes("getaddrinfo") || errorMessage.includes("ENOTFOUND")) {
      return { isLive: false, statusCode: 0, error: "DNS lookup failed" };
    }
    if (errorMessage.includes("ECONNREFUSED")) {
      return { isLive: false, statusCode: 0, error: "Connection refused" };
    }
    return { isLive: false, statusCode: 0, error: errorMessage };
  }
}

/**
 * Validates that a scraped competitor actually matches the target business type.
 * Returns true if relevant, false if this is a false positive match (e.g., "bark" in statue shop).
 */
export async function validateCompetitorRelevance(
  competitorName: string,
  scrapeResult: ScrapeResult,
  targetBusinessContext: string
): Promise<{ isRelevant: boolean; reason: string }> {
  if (!scrapeResult.success) {
    return { isRelevant: false, reason: "Failed to scrape website" };
  }

  const prompt = `
CRITICAL VALIDATION TASK:
You must determine if the scraped website is actually a DIRECT competitor to the target business.

TARGET BUSINESS (this is the business we're analyzing - use this to judge competitors):
${targetBusinessContext}

SCRAPED COMPETITOR TO VALIDATE:
- Name: ${competitorName}
- Description from their website: ${scrapeResult.content.description}
- Main Products: ${scrapeResult.content.mainProducts.join(", ")}
- Target Market: ${scrapeResult.content.targetMarket}

YOUR TASK:
1. Does the competitor sell the SAME type of products/services as the target business?
2. Do they target a SIMILAR customer demographic?
3. Is this a TRUE competitor or just a false positive (e.g., keyword match like "bark" in URL but not actually dog training)?
4. CRITICAL: Is the competitor in the SAME REGION as the target business? If not, reject it.

Respond with JSON:
{
  "isRelevant": true/false,
  "reason": "Brief explanation of why this is or isn't a valid competitor"
}`;

  try {
    const { content } = await summaryService.generateResponse([
      { role: "system", content: "You are a strict business validation analyst. Only return true if the competitor DIRECTLY competes with the target business. Be skeptical of keyword matches - verify actual business alignment." },
      { role: "user", content: prompt }
    ], 0.2, 500, "summary");

    const validation = JSON.parse(content);
    console.log(`[Scraper] Competitor validation for ${competitorName}: ${validation.isRelevant} - ${validation.reason}`);
    return {
      isRelevant: validation.isRelevant,
      reason: validation.reason || "Validation failed"
    };
  } catch (error) {
    console.error(`[Scraper] Validation error for ${competitorName}:`, error);
    // On error, default to accepting the competitor to avoid over-rejection
    return { isRelevant: true, reason: "Validation check failed, accepting by default" };
  }
}

export async function scrapeCompetitors(competitors: Array<{name: string, websiteUrl: string}>, businessContext?: string): Promise<Map<string, ScrapeResult>> {
  const results = new Map<string, ScrapeResult>();

  console.log(`[Scraper] Starting competitor analysis for ${competitors.length} competitors`);

  for (const competitor of competitors) {
    if (competitor.websiteUrl) {
      const result = await scrapeWebsite(competitor.websiteUrl, competitor.name, businessContext);
      results.set(competitor.name, result);

      // Rate limiting - be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Scraper] Completed competitor analysis`);
  return results;
}

export function formatCompetitorInsights(results: Map<string, ScrapeResult>): string {
  let insights = "\n\n## Detailed Competitor Analysis\n";
  
  for (const [name, result] of Array.from(results)) {
    if (!result.success) {
      insights += `\n### ${name}\n*Analysis failed*\n`;
      continue;
    }
    
    const c = result.content;
    insights += `
### ${name}
**Description:** ${c.description}
**Target Market:** ${c.targetMarket}
**Price Range:** ${c.pricing}
**Main Products:** ${c.mainProducts.join(", ")}

**Brand Story:** ${c.brandStory}

**Unique Selling Points:**
${c.uniqueSellingPoints.map(p => `- ${p}`).join("\n")}

**Social Media:** ${Object.entries(c.socialMedia).map(([k,v]) => `${k}: ${v}`).join(", ")}

**Customer Sentiment:**
${c.recentReviews.length > 0 ? c.recentReviews.map(r => `- [${r.source}] ${r.rating}★: "${r.text}" (${r.date})`).join("\n") : "No reviews found"}

**Strengths:** ${(c.strengths || []).join(", ")}
**Weaknesses:** ${(c.weaknesses || []).join(", ")}
`;
  }
  
  return insights;
}
