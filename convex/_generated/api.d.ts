/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as collaboration from "../collaboration.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as savedSearches from "../savedSearches.js";
import type * as subscriptions from "../subscriptions.js";
import type * as templates from "../templates.js";
import type * as users from "../users.js";
import type * as yjsSync from "../yjsSync.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  collaboration: typeof collaboration;
  crons: typeof crons;
  documents: typeof documents;
  folders: typeof folders;
  http: typeof http;
  savedSearches: typeof savedSearches;
  subscriptions: typeof subscriptions;
  templates: typeof templates;
  users: typeof users;
  yjsSync: typeof yjsSync;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
