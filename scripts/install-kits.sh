#!/bin/sh
# Fetches the ui-kit submodule at the commit this repo pins, unless Vercel's
# own clone already checked it out.
#
# Vercel only clones submodules that are publicly reachable over HTTP, so a
# private kit is fetched here. GIT_SHARED_SUBMODULE_TOKEN is a team-level
# Vercel shared environment variable: a fine-grained GitHub token with
# read-only Contents access to the private kits. It is passed as a one-off
# `git -c` rewrite, so it is never written to disk or .gitmodules.

set -eu

KITS="ui-kit"

fetch() {
  # --force: when Vercel's clone fails on one submodule it can leave the others
  # at the pinned commit with no files, which a plain update treats as done.
  if [ -n "${GIT_SHARED_SUBMODULE_TOKEN:-}" ]; then
    git -c "url.https://x-access-token:${GIT_SHARED_SUBMODULE_TOKEN}@github.com/.insteadOf=https://github.com/" submodule update --init --force "vendor/$1"
  else
    git submodule update --init --force "vendor/$1"
  fi
}

for kit in $KITS; do
  if [ -f "vendor/$kit/package.json" ]; then
    echo "$kit submodule already present"
    continue
  fi
  if [ -z "${GIT_SHARED_SUBMODULE_TOKEN:-}" ]; then
    echo "GIT_SHARED_SUBMODULE_TOKEN is not set; fetching $kit unauthenticated (works only if it is public)"
  fi
  fetch "$kit"
  if [ ! -f "vendor/$kit/package.json" ]; then
    echo "$kit submodule is still missing after fetch" >&2
    exit 1
  fi
done
echo "kit submodules ready"
