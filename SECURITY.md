# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in `lint`, please do **not** open a public GitHub issue.

Instead, report it privately to: **security@lint.to**

Please include:

- a clear description of the issue
- steps to reproduce or a proof of concept
- the version of `lint` affected (`lint --version`)
- the impact you think this has

You will receive an acknowledgment within a few business days.

## Supported versions

Security fixes are applied to the latest published release on npm. Older versions are not maintained.

## Dependency advisories

`lint` runs `npm audit --audit-level=moderate` in CI on every push via `npm run security:audit`. Moderate or higher advisories on runtime dependencies fail the build and are addressed before release.
