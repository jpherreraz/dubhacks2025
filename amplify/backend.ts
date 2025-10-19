import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

export const backend = defineBackend({
  auth,
  data,
  storage,
});

// Note: Bedrock permissions are added manually to the authenticated user IAM role
// via AWS IAM console with the BedrockInvokePolicy inline policy
