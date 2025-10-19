# Deploy Permanent AWS Amplify Backend

This guide will help you deploy a permanent AWS backend (DynamoDB, Cognito) that all developers can share.

## Option 1: AWS Amplify Hosting (Recommended - Easiest)

### Step 1: Create Amplify App in AWS Console

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click "New app" → "Host web app"
3. Choose "GitHub" as your repository service
4. Authorize AWS Amplify to access your GitHub account
5. Select your repository: `dubhacks2025`
6. Select branch: `main`

### Step 2: Configure Build Settings

Amplify will auto-detect your Expo/React Native app. Use these settings:

```yaml
version: 1
backend:
  phases:
    build:
      commands:
        - npm ci
        - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### Step 3: Deploy

1. Click "Save and deploy"
2. Wait for deployment to complete (5-10 minutes)
3. Backend resources (DynamoDB, Cognito) are now permanent!

### Step 4: Download amplify_outputs.json

1. In Amplify Console, go to your app
2. Click "Backend" tab
3. Download `amplify_outputs.json`
4. Place it in your project root: `/Users/jpherrera/Documents/dubhacks2025/amplify_outputs.json`

### Step 5: Commit and Share

```bash
git add amplify_outputs.json
git commit -m "Add production backend configuration"
git push
```

Now all developers can pull this file and connect to the same backend!

---

## Option 2: Manual CDK Deployment (Advanced)

If you don't want to use Amplify Hosting, you can manually deploy using CDK:

### Step 1: Install AWS CDK

```bash
npm install -g aws-cdk
```

### Step 2: Bootstrap CDK (if not done)

```bash
npx cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

### Step 3: Deploy Backend

```bash
cd amplify
npx cdk deploy --all
```

This creates permanent CloudFormation stacks for your backend.

---

## Option 3: Keep Sandbox But Share Config (Quick & Dirty)

For hackathons/quick testing:

### On Computer #1 (with the users):

1. Find `amplify_outputs.json` in project root
2. Copy it to a shared location (Google Drive, Dropbox, etc.)
3. Or commit it to Git temporarily

### On Computer #2:

1. Get the `amplify_outputs.json` from Computer #1
2. Place it in project root
3. Don't run `npx ampx sandbox` - just run `npm start`
4. App connects to Computer #1's sandbox resources

**Note:** Sandbox resources get deleted when Computer #1 stops the sandbox!

---

## Recommended: Option 1 (Amplify Hosting)

For your use case (development/testing, shared data), Option 1 is best because:

✅ Permanent backend resources
✅ Easy to set up (no manual CDK knowledge needed)
✅ Automatic deployments when you push to GitHub
✅ Free tier covers most development usage
✅ All team members share the same data

Cost: ~$0-5/month for development workloads
