import { parseAsString } from "nuqs";

export const searchParams = {
  q: parseAsString.withDefault(""),
};
