# AWS Amplify Authentication Setup

This project has been configured with AWS Amplify Gen 2 for authentication using Amazon Cognito.

## Prerequisites

- Node.js 18+ installed
- AWS Account (create one at https://aws.amazon.com)
- AWS CLI configured (optional but recommended)

## Setup Instructions

### 1. Install Amplify CLI

First, install the Amplify CLI globally:

```bash
npm install -g @aws-amplify/cli
```

### 2. Configure AWS Credentials

You need to configure your AWS credentials. You have two options:

**Option A: Using AWS CLI (Recommended)**
```bash
aws configure
```

**Option B: Using Amplify CLI**
```bash
amplify configure
```

Follow the prompts to set up your AWS credentials.

### 3. Deploy the Backend

Navigate to the amplify directory and deploy:

```bash
cd amplify
npx ampx sandbox
```

This will:
- Create a development sandbox in your AWS account
- Set up Amazon Cognito User Pool and Identity Pool
- Generate the configuration file automatically

The sandbox will watch for changes and auto-deploy them. Keep this terminal running.

### 4. Get Your Configuration

After the sandbox is deployed, it will generate an `amplify_outputs.json` file. You need to:

1. Copy the values from `amplify_outputs.json`
2. Update `/lib/amplify-config.ts` with the actual values

Replace these placeholders in `lib/amplify-config.ts`:
- `YOUR_USER_POOL_ID`
- `YOUR_USER_POOL_CLIENT_ID`
- `YOUR_IDENTITY_POOL_ID`

Or simply import the generated config:

```typescript
import outputs from '../amplify_outputs.json';
import { Amplify } from 'aws-amplify';

export function configureAmplify() {
  Amplify.configure(outputs);
}
```

### 5. Run the App

In a new terminal (keep the sandbox running):

```bash
npm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web

## Testing Authentication

1. Start the app
2. You'll see the login screen
3. Tap "Sign Up" to create an account
4. Enter email and password (min 8 chars, must include uppercase, lowercase, number, and special character)
5. Check your email for the verification code
6. Enter the code to verify your account
7. Sign in with your credentials

## Features Included

- Email/Password authentication
- User sign up with email verification
- User sign in
- User sign out
- Protected routes (automatically redirects to login if not authenticated)
- Auth context for easy access to user state

## Production Deployment

For production, you'll want to use Amplify's production deployment:

```bash
cd amplify
npx ampx pipeline-deploy --branch main --app-id <your-app-id>
```

Or deploy via the AWS Console using Amplify Hosting.

## AWS Resources Created

When you run the sandbox, AWS will create:
- Amazon Cognito User Pool (for user authentication)
- Amazon Cognito Identity Pool (for AWS credentials)
- IAM roles for authenticated and unauthenticated users

## Costs

The AWS Free Tier includes:
- 50,000 monthly active users for Amazon Cognito
- First 12 months free for most services

After free tier limits, Cognito costs approximately:
- $0.0055 per monthly active user for the first 50,000 users

## Cleanup

To delete the sandbox and all AWS resources:

```bash
cd amplify
npx ampx sandbox delete
```

## Troubleshooting

### "No credentials" error
Make sure you've configured AWS credentials using `aws configure` or `amplify configure`.

### Email not sending
By default, Cognito uses email for verification. Make sure the email you're testing with is valid. For production, you should verify your sender email in Amazon SES.

### App not connecting to backend
Make sure:
1. The sandbox is running (`npx ampx sandbox`)
2. You've updated the config in `lib/amplify-config.ts` with actual values
3. The app has been restarted after config changes

## Next Steps

- Add social login (Google, Facebook, etc.)
- Add MFA (Multi-Factor Authentication)
- Customize the Cognito UI
- Add user profile management
- Implement password reset functionality

## Documentation

- [AWS Amplify Docs](https://docs.amplify.aws/)
- [Amazon Cognito Docs](https://docs.aws.amazon.com/cognito/)
- [Amplify Gen 2 Guide](https://docs.amplify.aws/gen2/)
