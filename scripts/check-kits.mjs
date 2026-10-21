import { existsSync } from "node:fs";

/**
 * Fails the build up front when a kit submodule wasn't fetched. Without this,
 * a missing submodule surfaces as dozens of "Module not found" errors from
 * every file that imports the kit.
 */
for (const kit of ["ui-kit"]) {
  if (!existsSync(`vendor/${kit}/package.json`)) {
    console.error(
      `vendor/${kit} is empty: the ${kit} submodule was not fetched. ` +
        "Run `git submodule update --init` (on Vercel, check GIT_SHARED_SUBMODULE_TOKEN and scripts/install-kits.sh).",
    );
    process.exit(1);
  }
}
