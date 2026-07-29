/**
 * Build identity, shown on the title screen.
 *
 * Playtest notes are written against whatever was live that day, and a
 * screenshot of a fixed bug is indistinguishable from a screenshot of a
 * stale build. The date is here so a report can be matched to a build
 * without digging through git.
 *
 * Bump BUILD_DATE on every deploy; bump APP_VERSION when mechanics change.
 * Pre-1.0 while the game is in playtest.
 */
export const APP_VERSION = "0.7.0";
export const BUILD_DATE = "2026-07-29";

export const VERSION_LABEL = `${APP_VERSION} (${BUILD_DATE})`;
