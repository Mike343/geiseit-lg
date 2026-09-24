import { client } from "./client";
import { createEndpoints } from "./endpoints";

export const api = createEndpoints(client);
