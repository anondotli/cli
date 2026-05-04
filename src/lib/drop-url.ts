interface DropIdentifier {
  dropId: string;
  key: string | null;
}

/**
 * Parse a drop target that can be either:
 *   - A full URL:  https://anon.li/d/<id>#<key>
 *   - A plain drop ID:  abc123
 *
 * Returns the extracted drop ID and (if present) the decryption key.
 */
export function parseDropIdentifier(input: string): DropIdentifier {
  try {
    const parsed = new URL(input);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const dIndex = pathParts.indexOf("d");
    if (dIndex === -1 || !pathParts[dIndex + 1]) {
      throw new Error("Invalid URL format");
    }
    return {
      dropId: pathParts[dIndex + 1],
      key: parsed.hash.slice(1) || null,
    };
  } catch {
    // Not a valid URL — treat as a plain drop ID
    return { dropId: input, key: null };
  }
}
