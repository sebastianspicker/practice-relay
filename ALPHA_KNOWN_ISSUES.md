# Practice Relay 0.4.0-alpha.1: known issues for testers

Thank you for testing this alpha. It is a local evaluation build: everything
runs on your own machine, on synthetic data, with demo accounts. It is not a
hosted service, and nothing you do in it reaches a real learning platform.

Follow the README quick start first. This page lists what does not work yet,
what to do about it, and how to report problems.

## Before you start

- **Use Node.js 24.** Other Node versions are not supported. On Node 25 and
  later, `corepack enable` fails because Corepack is no longer bundled; install
  pnpm 9.15.0 another way (for example `npm install -g pnpm@9.15.0`).
- **The full check stops early on a Node version other than 24.**
  `pnpm check:all` halts at the packaged-module check, which insists on
  Node 24. The other checks can still be run one by one with the commands listed
  in the README.
- **Use only the demo accounts and synthetic material.** Do not upload real
  recordings of people, and do not reuse a real password anywhere in this build.

## Things that do not work yet, or work differently than you might expect

**Signing in to the web workspace needs one extra setting on the API.**
The API refuses browser requests from addresses it hasn't been told to trust.
Start it exactly as the README shows, including
`PRACTICE_RELAY_ALLOWED_ORIGINS=http://127.0.0.1:5173`. Without it, sign-in fails
with "untrusted Origin header". If you run the workspace on a different port,
put that address in the setting instead.

**The web workspace always talks to the API on port 8787.**
Changing the API's address means editing the workspace's page by hand.
Workaround: keep the API on its default port.

**The LMS simulator only works when both programs share one secret.**
Generate the secret once and set it in the terminal running the API and in the
terminal running the simulator, as shown in the simulator's README. Otherwise
launches fail with "invalid id_token" and grade submissions are rejected.

**The LMS simulator assumes default addresses.**
It advertises the API at `localhost:8787` even if you started the API somewhere
else. Workaround: keep the default ports (API 8787, simulator 8790).

**Submitting a record shows a simulated grade pass-back.**
The submit response includes a grade result marked `local-mock`. No grade is
sent anywhere. This is a placeholder, not a confirmation.

**ZIP exports contain the record's metadata, not its media.**
This is intended for this alpha. Download media separately from the record.

**Multi-process mode with PostgreSQL and S3-compatible storage hasn't been
integration-tested for this alpha.** The default in-memory store and the
single-process JSON store are the supported setups. If you try PostgreSQL,
please say so in any report.

**Signing out, reloading the page, or a session expiring clears your work in
the browser.** Sign-in tokens and movement drafts live only in memory. Export
or save anything you want to keep before reloading.

**Unexpected server errors give little detail.** The API's log line for an
unexpected error has the error message and a request ID, but no stack trace.
The request ID lets us find it, so please include it (see below).

**Local test data accumulates.** The API keeps uploaded media in a `data`
folder inside the API package directory, and Git ignores it. Stop the API and
delete that folder to start fresh.

## Reporting a problem

**Security issues: report privately.** Do not open a public issue. On the
GitHub repository, open the **Security** tab and choose **Report a
vulnerability**. We aim to acknowledge reports within 14 days.

**Everything else: open an issue** with the bug report form on the GitHub
repository. Please include:

1. **Version:** `0.4.0-alpha.1` and the commit you tested
   (`git rev-parse --short HEAD`).
2. **Environment:** operating system, `node --version`, `pnpm --version`, and
   your browser and its version if the web workspace is involved.
3. **Exact steps:** the commands you ran, with any settings you added, and
   which demo account you used. Replace any secret value with `<redacted>`.
4. **What you expected and what happened.** Copy error messages exactly.
5. **The request ID.** Every API response carries an `x-request-id` header, and
   the same ID appears in the API's log line (in your browser's developer tools
   under Network, or in the `curl -i` output).
6. **The API's terminal output** around the failure. It prints one JSON line per
   request.
7. **For the web workspace:** any errors from the browser's developer console.
8. **For the LMS simulator:** the JSON response the simulator returned.

Please never attach real participant media, personal data, real passwords, or
the shared LTI secret.
