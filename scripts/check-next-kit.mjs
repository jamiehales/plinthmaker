import { existsSync } from "node:fs";

/**
 * Fails the build up front when the next-kit submodule wasn't fetched. Without
 * this, a missing submodule surfaces as dozens of "Module not found" errors
 * from every file that imports the kit.
 */
if (!existsSync("vendor/next-kit/package.json")) {
  console.error(
    "vendor/next-kit is empty: the next-kit submodule was not fetched. " +
      "Run `git submodule update --init` (on Vercel, check GIT_SHARED_SUBMODULE_TOKEN and scripts/install-next-kit.sh).",
  );
  process.exit(1);
}
