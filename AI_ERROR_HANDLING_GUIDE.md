# AI Error Handling Guide

This document outlines the error handling strategy implemented for Together.ai API calls in the Next Big Thing Theory application.

## Error Classification

### Transport/Network Errors
These are fetch-level failures that occur before getting a valid API response:
- `fetch failed`
- Network connectivity issues
- DNS/TLS failures
- Socket timeouts/hangups
- Request timeouts
- ECONNRESET, ECONNREFUSED

**Response Strategy**: Retry the same model immediately (transport errors are often transient)

### API Server Errors (5xx)
These are server-side issues from Together.ai:
- `503 Service Unavailable` - Model overloaded/unavailable
- `504 Gateway Timeout` - Request took too long
- `500 Internal Server Error` - Server-side issue

**Response Strategy**: Retry once, then fallback to alternative model

### Client/API Errors (4xx)
These are client-side issues:
- `429 Rate Limited` - Too many requests
- `401 Unauthorized` - Invalid API key
- `400 Bad Request` - Invalid parameters

**Response Strategy**: Handle specifically (e.g., wait for rate limits, check API key)

### JSON Parsing Errors
These occur when the API response is malformed:
- `Unexpected end of JSON input`
- Invalid JSON structure
- Trailing commas
- Unbalanced quotes
- Missing braces

**Response Strategy**: Retry with increased max_tokens (truncation issue), then fallback

## Implementation Details

### Enhanced AIService Class

The `AIService` class now includes:

1. **Timeout Handling**: Explicit 45-second timeout (configurable via `AI_REQUEST_TIMEOUT_MS`)
2. **Error Classification**: Distinguishes transport vs API vs JSON errors
3. **Retry Logic**: 
   - Transport errors: Retry same model immediately
   - API errors: Retry once, then fallback
   - JSON errors: Retry with increased tokens
4. **Detailed Logging**: Comprehensive error logging with model, attempt, and error details

### Error Logging

Detailed error logging includes:
- Model name and attempt number
- HTTP status codes
- Error message previews
- Specific error patterns (rate limits, timeouts, etc.)
- JSON structure analysis

## Recommended Policy

Based on your analysis, here's the recommended error handling policy:

### Fetch Failed (Transport Error)
```
fetch failed → retry same model once → then fallback
```

### 503 Service Unavailable
```
503 → retry same model once → then fallback
```

### JSON Parsing Issues
```
bad JSON → repair/retry same model once → then fallback
```

### Only Fallback For
- Repeated 503 errors
- Repeated malformed outputs
- Repeated timeout after retry
- Persistent transport failures

## Configuration

Environment variables:
- `AI_REQUEST_TIMEOUT_MS`: Request timeout in milliseconds (default: 45000)
- `TOGETHER_API_KEY`: Your Together.ai API key
- Model-specific fallback configurations

## Monitoring

Check terminal logs for detailed error information:
- `[AI Error]` - API-level errors
- `[JSON Error]` - JSON parsing issues
- `Transport/timeout error detected` - Network issues

This implementation follows industry best practices for robust AI API integration with proper error classification, retry logic, and fallback strategies.