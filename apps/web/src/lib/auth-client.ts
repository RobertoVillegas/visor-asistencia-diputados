import { createAuthClient } from "better-auth/react";

import { api } from "./api";

export const authClient = createAuthClient({
  baseURL: api.baseUrl,
  fetchOptions: {
    credentials: "include",
  },
});
