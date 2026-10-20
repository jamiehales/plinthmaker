#!/bin/sh
# Fetches the private next-kit submodule at the commit this repo pins.
#
# Vercel can't clone private submodules itself (it only supports submodules
# that are publicly reachable over HTTP), so the install step runs this first.
# GIT_SHARED_SUBMODULE_TOKEN is a team-level Vercel shared environment variable:
# a fine-grained GitHub token with read-only Contents access to next-kit. It is
# passed as a one-off `git -c` rewrite, so it is never written to disk or
# .gitmodules.

set -eu

if [ -f vendor/next-kit/package.json ]; then
  echo "next-kit submodule already present"
  exit 0
fi

if [ -z "${GIT_SHARED_SUBMODULE_TOKEN:-}" ]; then
  echo "GIT_SHARED_SUBMODULE_TOKEN is not set; trying an unauthenticated submodule fetch (works only if next-kit is public)"
  git submodule update --init
else
  git -c "url.https://x-access-token:${GIT_SHARED_SUBMODULE_TOKEN}@github.com/.insteadOf=https://github.com/" submodule update --init
fi

if [ ! -f vendor/next-kit/package.json ]; then
  echo "next-kit submodule is still missing after fetch" >&2
  exit 1
fi
echo "next-kit submodule fetched"
