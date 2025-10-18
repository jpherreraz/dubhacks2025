import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  FriendRequest: a
    .model({
      senderEmail: a.string().required(),
      receiverEmail: a.string().required(),
      status: a.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.authenticated(),
    ]),

  Friend: a
    .model({
      userEmail: a.string().required(),
      friendEmail: a.string().required(),
      addedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Message: a
    .model({
      senderEmail: a.string().required(),
      receiverEmail: a.string().required(),
      content: a.string().required(),
      createdAt: a.datetime().required(),
      read: a.boolean().default(false),
    })
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
