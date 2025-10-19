import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'chatFiles',
  access: (allow) => ({
    'files/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
  }),
});
