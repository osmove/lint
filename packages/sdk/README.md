# @osmove/lint-sdk

TypeScript SDK for the [Lint](https://lint.to) cloud API. Typed client generated from the OpenAPI spec at `api.lint.to/openapi/v1.yaml`.

## Install

```bash
npm install @osmove/lint-sdk
```

## Usage

```ts
import { createLintClient } from "@osmove/lint-sdk";

const client = createLintClient({
  baseUrl: "https://api.lint.to",  // optional, default
  token: process.env.LINT_API_TOKEN, // optional
});

// All endpoints are typed from the OpenAPI spec.
const { data, error } = await client.GET("/health");
```

## Regenerate types

```bash
pnpm openapi:fetch   # pulls latest spec from api.lint.to
pnpm openapi:types   # regenerates src/generated/openapi-types.ts
pnpm build
```

Apache-2.0.
