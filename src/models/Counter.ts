export async function nextSequence(name: string): Promise<number> {
  if (name !== "contactId") {
    throw new Error(`Unsupported sequence name: ${name}`);
  }

  // Uses a PostgreSQL sequence named `contact_id_seq`.
  // Create it with:
  //   CREATE SEQUENCE IF NOT EXISTS contact_id_seq START 1;
  const { query } = await import("../db");
  const result = await query<{ seq: number }>(
    "SELECT nextval('contact_id_seq') AS seq"
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to generate sequence from PostgreSQL");
  }
  return row.seq;
}

