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
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as subscriptions from "../subscriptions.js";
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
  documents: typeof documents;
  http: typeof http;
  subscriptions: typeof subscriptions;
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
