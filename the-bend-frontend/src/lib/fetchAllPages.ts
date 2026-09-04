type PaginatedPayload<T> =
  | T[]
  | {
      items?: T[];
      next_cursor?: string | null;
      has_more?: boolean;
    };

type PageResponse<T> = Promise<{ data: PaginatedPayload<T> }>;

export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (cursor?: string) => PageResponse<T>,
): Promise<T[]> {
  const items = new Map<string, T>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const response = await fetchPage(cursor);
    const payload = response.data;
    const pageItems = Array.isArray(payload) ? payload : (payload.items ?? []);
    pageItems.forEach((item) => items.set(item.id, item));

    if (Array.isArray(payload) || !payload.has_more || !payload.next_cursor) {
      break;
    }
    if (seenCursors.has(payload.next_cursor)) {
      break;
    }
    seenCursors.add(payload.next_cursor);
    cursor = payload.next_cursor;
  }

  return Array.from(items.values());
}
