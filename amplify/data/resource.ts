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

  Server: a
    .model({
      name: a.string().required(),
      description: a.string(),
      ownerEmail: a.string().required(),
      isGeneral: a.boolean().default(false),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.authenticated()]),

  ServerMember: a
    .model({
      serverId: a.string().required(),
      userEmail: a.string().required(),
      joinedAt: a.datetime().required(),
      isAdmin: a.boolean().default(false),
    })
    .authorization((allow) => [allow.authenticated()]),

  Channel: a
    .model({
      serverId: a.string().required(),
      name: a.string().required(),
      isGeneral: a.boolean().default(false),
      createdAt: a.datetime().required(),
      createdBy: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  ServerMessage: a
    .model({
      serverId: a.string().required(),
      channelId: a.string().required(),
      senderEmail: a.string().required(),
      content: a.string().required(),
      createdAt: a.datetime().required(),
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
