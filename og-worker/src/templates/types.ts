import type { El } from "../h";
import type { Q } from "../params";
import type { Loader } from "../images";
import type { Size } from "../ui";

export interface Ctx {
    q: Q;
    image: Loader;
}
export interface Rendered {
    el: El;
    size: Size;
}
export type Template = (ctx: Ctx) => Promise<Rendered>;
