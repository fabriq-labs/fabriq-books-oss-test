# Security

## Reporting a vulnerability

**Maintainers: replace this section with a real contact before a public release.** No security address has been chosen yet.

Until that contact is filled in, do not open a public GitHub issue for a suspected vulnerability. A public issue puts the details in front of everyone who can see the repository, including people who have not upgraded. Email the maintainers of this repository directly, and wait for them to acknowledge it before discussing the report in public.

When you write, include:

- The version or commit you tested, and whether it was a local checkout or a deployed image
- The steps that demonstrate the problem, including the route or screen
- The impact you believe it has (data from another organization, credential exposure, and so on)
- Your name and how to reach you for a follow-up

Please give the maintainers time to reproduce and fix the issue before any public write-up.

## What this project expects you to protect

The seeded login `admin@example.com` / `admin123` and the example `DATABASE_URL` in `.env.example` are for a database on a machine you control. Change the password and the JWT secret before anyone else can reach the process. Do not deploy those example values unchanged.

`DATABASE_URL`, `JWT_SECRET`, `RAILWAY_TOKEN`, `ERP_CONFIG_ENCRYPTION_KEY`, Intuit client secrets, refresh tokens, and Airbyte client secrets belong in the environment, not in git. `railway variable list` prints secret values. Do not copy that output into an issue, a pull request, or a log you commit.

Connection credentials are encrypted with `ERP_CONFIG_ENCRYPTION_KEY` and are omitted from the connections view on purpose. A view returns every field it names. Do not add `connection_config` or `extraction_config` to a `data_graph` to make them easier to debug.

## Policy documents

PDFs shipped with the repository, for readers who want the written policy rather than this reporting note:

- [docs/security/DATA_POLICY.pdf](docs/security/DATA_POLICY.pdf)
- [docs/security/INFORMATION_SECURITY_POLICY.pdf](docs/security/INFORMATION_SECURITY_POLICY.pdf)
