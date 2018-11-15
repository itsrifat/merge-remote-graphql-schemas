import { graphql } from "graphql";
import gql from "graphql-tag";
import { makeExecutableSchema, mergeSchemas } from "graphql-tools";
import { printSchema } from "graphql/utilities";
import "jasmine";
import { mergeRemoteSchemas } from "./merge-remote-schemas";

const combinedSchema = `type Bar {
  id: ID!
  foo: Foo!
}

union Both = Foo | Bar

type Foo {
  id: ID!
  name: String!
  bars: [Bar!]!
}

type Mutation {
  updateFoo(input: UpdateFooInput!): Foo!
}

type Query {
  foo(id: ID!): Foo
  foos: [Foo!]!
  bar(id: ID!): Bar
}

interface Something {
  id: ID!
  bar: Bar!
}

input UpdateFooInput {
  id: ID!
  name: String!
}
`;

describe("mergeRemoteSchemas", () => {

  const fooSchema = makeExecutableSchema({
    typeDefs: gql`
      type Query {
        foo(id: ID!): Foo
        foos: [Foo!]!
      }

      type Mutation {
        updateFoo(input: UpdateFooInput!): Foo!
      }

      input UpdateFooInput {
        id: ID!,
        name: String!
      }

      type Foo {
        id: ID!
        name: String!
      }
    `,
    resolvers: {
      Query: {
        foo: () => ({ id: "foo", name: "Name" }),
        foos: () => [{ id: "foo", name: "Name" }],
      },
      Mutation: {
        updateFoo: (_, { input: { id, name } }) => ({ id, name }),
      },
    },
  });

  const barSchema = makeExecutableSchema({
    typeDefs: gql`
      type Query {
        bar(id: ID!): Bar
        foo(id: ID!): Foo
      }

      union Both = Foo | Bar

      interface Something {
        id: ID!,
        bar: Bar!
      }

      type Bar {
        id: ID!
        foo: Foo!
      }

      type Foo {
        id: ID!
        bars: [Bar!]!
      }
    `,
    resolvers: {
      Query: {
        bar: () => ({ id: "bar", foo: { id: "foo" }}),
        foo: () => ({ id: "foo", bars: [{ id: "bar" }] }),
      },
      Foo: {
        bars: () => [{ id: "bar" }],
      },
    },
  });

  it("should merge passed in schemas", () => {
    const independentBarSchema = makeExecutableSchema({
      typeDefs: gql`
        type Query {
          bar(id: ID!): Bar
        }

        type Bar {
          id: ID!
        }
      `,
      resolvers: {
        Query: {
          bar: () => ({ id: "bar" }),
        },
      },
    });

    const mergedSchema = mergeRemoteSchemas({ schemas: [fooSchema, independentBarSchema ]});
    expect(mergedSchema.toString()).toEqual(mergeSchemas({ schemas: [fooSchema, independentBarSchema]}).toString());
  });

  it("should merge duplicate types", () => {

    const mergedSchema = mergeRemoteSchemas({ schemas: [fooSchema, barSchema]});
    expect(printSchema(mergedSchema)).toEqual(combinedSchema);
  });

  it("should answer cross-schema queries", () => {

    const mergedSchema = mergeRemoteSchemas({ schemas: [fooSchema, barSchema]});
    graphql(mergedSchema, `
      query {
        bar(id: "bar") {
          id
          foo {
            id
            name
            bars {
              id
            }
          }
        }
        foos {
          id
        }
      }
    `)
      .then((result) => {
        expect(result).toEqual({
          data: {
            bar: {
              id: "bar",
              foo: {
                id: "foo",
                name: "Name",
                bars: [{ id: "bar" }],
              },
            },
            foos: [ { id: "foo" }],
          },
        });
      })
      .catch(() => fail());
  });

  it("should perform mutations", () => {

    const mergedSchema = mergeRemoteSchemas({ schemas: [fooSchema, barSchema]});
    graphql(mergedSchema, `
      mutation updateFoo($input: UpdateFooInput!) {
        updateFoo(input: $input) {
          id
          name
        }
      }
    `, null, null, { input: { id: "foo", name: "something" } })
      .then((result) => {
        expect(result).toEqual({
          data: {
            updateFoo: {
              id: "foo",
              name: "something",
            },
          },
        });
      })
      .catch(() => fail());
  });
});
