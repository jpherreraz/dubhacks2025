import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  FriendRequest: a
    .model({
      senderEmail: a.string().required(),
      receiverEmail: a.string().required(),
      status: a.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
      createdAt: a.datetime().required(),
    })
    .authorization((allow: any) => [
      allow.authenticated(),
    ]),

  Friend: a
    .model({
      userEmail: a.string().required(),
      friendEmail: a.string().required(),
      addedAt: a.datetime().required(),
    })
    .authorization((allow: any) => [allow.authenticated()]),

  Message: a
    .model({
      senderEmail: a.string().required(),
      receiverEmail: a.string().required(),
      content: a.string().required(),
      fileUrl: a.string(),
      filePath: a.string(),
      fileName: a.string(),
      fileType: a.string(),
      createdAt: a.datetime().required(),
      read: a.boolean().default(false),
    })
    .authorization((allow: any) => [allow.authenticated()]),

  Server: a
    .model({
      name: a.string().required(),
      description: a.string(),
      ownerEmail: a.string().required(),
      isGeneral: a.boolean().default(false),
      createdAt: a.datetime().required(),
    })
    .authorization((allow: any) => [allow.authenticated()]),

  ServerMember: a
    .model({
      serverId: a.string().required(),
      userEmail: a.string().required(),
      joinedAt: a.datetime().required(),
      isAdmin: a.boolean().default(false),
    })
    .authorization((allow: any) => [allow.authenticated()]),

  Channel: a
    .model({
      serverId: a.string().required(),
      name: a.string().required(),
      isGeneral: a.boolean().default(false),
      restricted: a.boolean().default(false),
      createdAt: a.datetime().required(),
      createdBy: a.string(),
    })
    .authorization((allow: any) => [allow.authenticated()]),

  ServerMessage: a
    .model({
      serverId: a.string().required(),
      channelId: a.string().required(),
      senderEmail: a.string().required(),
      content: a.string().required(),
      createdAt: a.datetime().required(),
      replyToMessageId: a.string(),
    })
    .authorization((allow: any) => [allow.authenticated()]),

  ChannelNotification: a
    .model({
      userEmail: a.string().required(),
      channelId: a.string().required(),
      serverId: a.string().required(),
      messageId: a.string().required(),
      read: a.boolean().default(false),
      createdAt: a.datetime().required(),
    })
    .authorization((allow: any) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
