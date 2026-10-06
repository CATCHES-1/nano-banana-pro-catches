/** The bearer compare accepts exactly one header value and nothing that merely resembles it. */

import { isAuthorized } from "./auth.ts";

const assert = (condition: unknown, message: string) => {
	if (!condition) throw new Error(message);
};

const token = "s3cret-token";

assert(isAuthorized(`Bearer ${token}`, token), "the exact token is accepted");
assert(!isAuthorized(undefined, token), "a missing header is rejected");
assert(!isAuthorized("", token), "an empty header is rejected");
assert(!isAuthorized(token, token), "the bare token without the scheme is rejected");
assert(!isAuthorized(`Bearer ${token}x`, token), "a longer token is rejected");
assert(!isAuthorized(`Bearer ${token.slice(0, -1)}`, token), "a shorter token is rejected");
assert(!isAuthorized(`Bearer ${token.slice(0, -1)}X`, token), "a same-length wrong token is rejected");
assert(!isAuthorized(`bearer ${token}`, token), "the scheme is case-sensitive");

console.log("auth: all checks passed");
