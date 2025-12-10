/**
 * Utility functions for Watson Orchestrate authentication and API calls
 */

/**
 * Get IBM IAM access token using API key
 */
export async function getAccessToken(apiKey: string): Promise<string> {
  const tokenUrl = 'https://iam.cloud.ibm.com/identity/token';
  
  const formData = new URLSearchParams();
  formData.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
  formData.append('apikey', apiKey);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Get Watson Orchestrate configuration from environment variables
 */
export function getWatsonConfig() {
  const apiKey = process.env.WATSON_API_KEY;
  const apiEndpoint = process.env.WATSON_API_ENDPOINT;
  const agentId = process.env.WATSON_AGENT_ID;

  if (!apiKey || !apiEndpoint || !agentId) {
    throw new Error(
      'Missing Watson Orchestrate credentials. Required: WATSON_API_KEY, WATSON_API_ENDPOINT, WATSON_AGENT_ID'
    );
  }

  return { apiKey, apiEndpoint, agentId };
}

