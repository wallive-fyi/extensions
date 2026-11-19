# Contributing an extension

An extension in this store runs on the user's Mac as the user, with no sandbox: the permission groups Wallive confirms are the boundary for `sys.*` calls, and files and the network are not limited. Review is what the store's 审核过 label stands for, so every change to the code users get is a diff a maintainer read.

## Review rules

A maintainer merges a pull request when the extension:

- does what its description says;
- asks for the permission groups it uses and no more;
- sends no data off the Mac that its README does not name;
- holds no analytics;
- holds no obfuscated or minified code;
- downloads no executable at run time, unless it is pinned by hash from the upstream's own release;
- holds no keys or tokens in its source;
- has its text in English, and in Chinese as well where the author writes Chinese.

The check's comment lists what grows an extension's reach (new groups, reads and hooks, new files under `bin/`, new dependencies and their licenses, calls to `sys.shell`, `sys.files.write`, `fetch` and `curl`); a reviewer reads each against the README and these rules.

## Ownership

A new id is claimed by the first merged pull request. A pull request that changes a folder its author does not own needs the owner's approval or a maintainer's.

## Review

A maintainer's merge is the review: a merged pull request is approved, and the next index build publishes it. A pull request that is not merged is not in the store.

## To be decided by the maintainers

These are not set, and the store does not open until they are:

- where a user reports an extension, and who answers a takedown request;
- how the rules above apply to an extension that wraps a paid service or a website's private interface.
