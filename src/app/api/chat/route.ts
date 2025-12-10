import { NextRequest } from 'next/server';
import { getAccessToken, getWatsonConfig } from '@/lib/watson';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { message, thread_id } = await request.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { apiKey, apiEndpoint, agentId } = getWatsonConfig();
    
    // Get access token
    const accessToken = await getAccessToken(apiKey);

    // Build the chat completions URL
    // Ensure apiEndpoint doesn't have trailing slash and construct proper path
    const baseUrl = apiEndpoint.replace(/\/$/, '');
    const chatUrl = `${baseUrl}/v1/orchestrate/${agentId}/chat/completions`;

    // Prepare the request body
    const requestBody: any = {
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      stream: true,
    };

    // Prepare headers
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // Include thread_id as header if provided (Watson Orchestrate expects it in X-IBM-THREAD-ID header)
    if (thread_id) {
      headers['X-IBM-THREAD-ID'] = thread_id;
      console.log('Sending request with thread_id in header:', thread_id);
    } else {
      console.log('Starting new conversation (no thread_id provided)');
    }

    // Make request to Watson Orchestrate
    const watsonResponse = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!watsonResponse.ok) {
      const errorText = await watsonResponse.text();
      console.error('Watson API error:', watsonResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Watson API error: ${watsonResponse.status}`,
          details: errorText 
        }),
        { 
          status: watsonResponse.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if response is streaming
    if (!watsonResponse.body) {
      return new Response(
        JSON.stringify({ error: 'No response body from Watson API' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a readable stream to forward the response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = watsonResponse.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            
            // Forward the chunk to the client
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    // Return the stream with appropriate headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

