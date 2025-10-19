import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fetchAuthSession } from 'aws-amplify/auth';

const BOT_EMAIL = 'bot@assistant';

export async function callBedrockBot(question: string): Promise<string> {
  try {
    // Get AWS credentials from Amplify (force refresh to get updated IAM permissions)
    const session = await fetchAuthSession({ forceRefresh: true });
    const credentials = session.credentials;

    if (!credentials) {
      throw new Error('No credentials available');
    }

    // Create Bedrock client with credentials
    const bedrockClient = new BedrockRuntimeClient({
      region: 'us-east-1', // Change if your Bedrock is in a different region
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const modelId = 'anthropic.claude-3-haiku-20240307-v1:0';

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: question || 'Hello'
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId,
      body: JSON.stringify(payload),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const apiResponse = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(apiResponse.body));

    return responseBody.content[0].text;
  } catch (error: any) {
    console.error('Error calling Bedrock:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.$metadata?.httpStatusCode);
    console.error('Full error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

export { BOT_EMAIL };
