export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export type PayloadAsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: T };
