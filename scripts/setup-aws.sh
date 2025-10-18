#!/bin/bash

echo "🚀 AWS Amplify Setup Script"
echo "============================"
echo ""

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not found!"
    echo ""
    echo "Please configure AWS credentials first:"
    echo "  Option 1: Run 'aws configure'"
    echo "  Option 2: Run 'amplify configure'"
    echo ""
    exit 1
fi

echo "✅ AWS credentials found"
echo ""

# Navigate to amplify directory
cd amplify

echo "📦 Installing Amplify backend dependencies..."
npm install

echo ""
echo "🏗️  Starting Amplify sandbox..."
echo ""
echo "This will create AWS resources in your account."
echo "Keep this terminal running - it will watch for changes."
echo ""
echo "After deployment completes:"
echo "1. Copy the generated amplify_outputs.json"
echo "2. Update /lib/amplify-config.ts with the values"
echo "3. Run 'npm start' in a new terminal"
echo ""

npx ampx sandbox
