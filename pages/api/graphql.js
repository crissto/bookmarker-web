import {
  intArg,
  makeSchema,
  objectType,
  stringArg,
  asNexusMethod,
} from 'nexus';
import { GraphQLDate } from 'graphql-iso-date';
import { PrismaClient } from '@prisma/client';
import { ApolloServer } from 'apollo-server-micro';

import path from 'path';

export const GQLDate = asNexusMethod(GraphQLDate, 'date');

const prisma = new PrismaClient();

const User = objectType({
  name: 'User',
  definition(t) {
    t.string('id');
    t.string('name');
    t.string('email');
    t.string('role_id');
    t.list.field('posts', {
      type: 'Post',
      resolve: (parent) =>
        prisma.user
          .findOne({
            where: { id: Number(parent.id) },
          })
          .posts(),
    });
  },
});

const Role = objectType({
  name: 'Role',
  definition(t) {
    t.string('id');
  },
});

const Post = objectType({
  name: 'Post',
  definition(t) {
    t.string('id');
    t.date('createdAt');
    t.date('updatedAt');
    t.string('title');
    t.string('content', {
      nullable: true,
    });
    t.boolean('published');
    t.field('author', {
      type: 'User',
      nullable: true,
      resolve: (parent) =>
        prisma.post
          .findOne({
            where: { id: Number(parent.id) },
          })
          .author(),
    });
  },
});

const Query = objectType({
  name: 'Query',
  definition(t) {
    t.list.field('users', {
      type: 'User',
      resolve: (_parent, _args, ctx) => {
        console.log(ctx);
        return prisma.user.findMany();
      },
    });

    t.list.field('filterPosts', {
      type: 'Post',
      args: {
        searchString: stringArg({ nullable: true }),
      },
      resolve: (_, { searchString }, ctx) => {
        return prisma.post.findMany({
          where: {
            OR: [
              { title: { contains: searchString } },
              { content: { contains: searchString } },
            ],
          },
        });
      },
    });
  },
});

const Mutation = objectType({
  name: 'Mutation',
  definition(t) {
    t.field('signupUser', {
      type: 'User',
      args: {
        name: stringArg(),
        email: stringArg({ nullable: false }),
      },
      resolve: (_, { name, email }, ctx) => {
        return prisma.user.create({
          data: {
            name,
            email,
          },
        });
      },
    });

    // t.field('deletePost', {
    //   type: 'Post',
    //   nullable: true,
    //   args: {
    //     postId: stringArg(),
    //   },
    //   resolve: (_, { postId }, ctx) => {
    //     return prisma.post.delete({
    //       where: { id: Number(postId) },
    //     });
    //   },
    // });

    // t.field('createDraft', {
    //   type: 'Post',
    //   args: {
    //     title: stringArg({ nullable: false }),
    //     content: stringArg(),
    //     authorEmail: stringArg(),
    //   },
    //   resolve: (_, { title, content, authorEmail }, ctx) => {
    //     return prisma.post.create({
    //       data: {
    //         title,
    //         content,
    //         published: false,
    //         author: {
    //           connect: { email: authorEmail },
    //         },
    //       },
    //     });
    //   },
    // });

    // t.field('publish', {
    //   type: 'Post',
    //   nullable: true,
    //   args: {
    //     postId: stringArg(),
    //   },
    //   resolve: (_, { postId }, ctx) => {
    //     return prisma.post.update({
    //       where: { id: Number(postId) },
    //       data: { published: true },
    //     });
    //   },
    // });
  },
});

export const schema = makeSchema({
  types: [Query, Mutation, Post, User, GQLDate],
  outputs: {
    typegen: path.join(__dirname, 'nexus-typegen.ts'),
    schema: path.join(__dirname, 'schema.graphql'),
  },
});

const decodeToken = (token) => {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString());
  } catch (err) {
    return { decodedToken: false };
  }
};

const apolloServer = new ApolloServer({
  schema,

  context: async ({ req }) => {
    const ret = { cookies: req.cookies };
    const { decodedToken } = decodeToken(req.headers.auth);

    if (req.headers?.auth && decodedToken) {
      ret.user = await prisma.user.findOne({
        where: { email: decodedToken.email },
      });
    }

    return ret;
  },
});

export const config = {
  api: {
    bodyParser: false,
  },
};

const apolloHandler = apolloServer.createHandler({ path: '/api/graphql' });

export default async (req, res) => {
  const sessionCookie = req.cookies['express:sess'] || req.headers.auth;

  const { decodedToken } = decodeToken(sessionCookie);
  if (!decodedToken) res.status(403).send('');

  const user = await prisma.user.findOne({
    where: {
      email: decodedToken.email,
    },
  });

  if (user.roleId === 1) {
    return apolloHandler(req, res);
  }

  res.status(403).send('');
};

// export default async (req, res) => {
//   const query = req.body.query;
//   const variables = req.body.variables;
//   const response = await graphql(schema, query, {}, {}, variables);
//   return res.end(JSON.stringify(response));
// };
