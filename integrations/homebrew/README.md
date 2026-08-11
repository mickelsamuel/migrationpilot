# Homebrew tap

`Formula/migrationpilot.rb` is the formula that installs the MigrationPilot CLI
through Homebrew. It lives here so it is versioned with the code, but Homebrew
can't read it from this path — a tap has to be its own repository.

Creating that repository is a launch-day action for a human. Nothing in CI does
it, and nothing here should.

## Creating the tap

Homebrew resolves `brew tap <user>/<name>` to the GitHub repository
`<user>/homebrew-<name>`. The `homebrew-` prefix is required.

1. Create a public repo named **`mickelsamuel/homebrew-migrationpilot`**.
2. Copy `Formula/migrationpilot.rb` from this directory into the repo, keeping
   the `Formula/` directory.
3. Commit and push to the default branch.

Users then install with:

```sh
brew install mickelsamuel/migrationpilot/migrationpilot
```

or, tapping first:

```sh
brew tap mickelsamuel/migrationpilot
brew install migrationpilot
```

## Verifying before you publish

From a checkout of the tap repo, on macOS or Linux:

```sh
brew audit --strict --online --new migrationpilot
brew install --build-from-source ./Formula/migrationpilot.rb
brew test migrationpilot
```

`brew test` runs the formula's own test block, which analyzes a safe migration
(expects exit 0) and an unsafe one (expects exit 2 and an MP004 finding).

## Updating on each release

The formula pins an exact npm tarball and its checksum, so every release needs
both bumped:

```sh
VERSION=1.6.0
URL="https://registry.npmjs.org/migrationpilot/-/migrationpilot-${VERSION}.tgz"
curl -sL "$URL" | shasum -a 256
```

Put the new `$URL` in `url` and the digest in `sha256`. `brew bump-formula-pr`
automates this once the tap exists.

## Why the formula installs from npm rather than a binary

The CLI is a Node program, and the npm tarball is the artifact that is already
built, published, and provenance-signed on every release. Pointing the formula
at it means Homebrew installs exactly what `npm install -g migrationpilot`
installs, with `node` as the only dependency.

The standalone executables built by `scripts/build-binary.js` are an
alternative, but each is roughly 60–115 MB because it embeds the whole Bun
runtime, against about 1.2 MB for the npm tarball. They exist for environments
without Node, which is not the situation a Homebrew user is in.
