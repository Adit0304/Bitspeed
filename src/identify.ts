import { ContactDoc, LinkPrecedence, mapContactRow } from "./models/Contact";
import { nextSequence } from "./models/Counter";
import { query } from "./db";

interface IdentifyInput {
  email: string | null;
  phoneNumber: string | number | null;
}

interface IdentifyResponse {
  contact: {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

function uniqInOrder(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function sortByCreatedAtAsc(a: Pick<ContactDoc, "createdAt">, b: Pick<ContactDoc, "createdAt">): number {
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function buildContactDocList(rows: any[]): ContactDoc[] {
  return rows.map((row) => mapContactRow(row));
}

export async function identify(input: IdentifyInput): Promise<IdentifyResponse> {
  const email = input.email ?? null;
  const phone =
    input.phoneNumber !== null && input.phoneNumber !== undefined
      ? String(input.phoneNumber)
      : null;

  if (!email && !phone) {
    throw new Error("Either email or phoneNumber must be provided");
  }

  // 1) Find contacts matching by email OR phone (ignore deletedAt)
  const initialWhere: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  const orClauses: string[] = [];

  if (email) {
    params.push(email);
    orClauses.push(`email = $${params.length}`);
  }
  if (phone) {
    params.push(phone);
    orClauses.push(`phone_number = $${params.length}`);
  }

  if (orClauses.length > 0) {
    initialWhere.push(`(${orClauses.join(" OR ")})`);
  }

  const initialQuery = `
    SELECT
      id,
      phone_number,
      email,
      linked_id,
      link_precedence,
      created_at,
      updated_at,
      deleted_at
    FROM contacts
    WHERE ${initialWhere.join(" AND ")}
    ORDER BY created_at ASC
  `;

  const initialResult = await query(initialQuery, params);
  const initialMatches = buildContactDocList(initialResult.rows);

  // 2) No match -> create a new primary
  if (initialMatches.length === 0) {
    const id = await nextSequence("contactId");
    await query(
      `INSERT INTO contacts (
         id,
         email,
         phone_number,
         linked_id,
         link_precedence,
         deleted_at
       ) VALUES ($1, $2, $3, NULL, $4, NULL)`,
      [id, email, phone, "primary" as LinkPrecedence]
    );

    return {
      contact: {
        primaryContatctId: id,
        emails: email ? [email] : [],
        phoneNumbers: phone ? [phone] : [],
        secondaryContactIds: [],
      },
    };
  }

  // 3) Expand to full cluster(s): get the primary IDs behind the initial matches
  const primaryIds = new Set<number>();
  for (const c of initialMatches) {
    if (c.linkPrecedence === "primary") primaryIds.add(c.id);
    else if (c.linkedId != null) primaryIds.add(c.linkedId);
    else primaryIds.add(c.id);
  }

  const primaryIdList = [...primaryIds];

  const clustersQuery = `
    SELECT
      id,
      phone_number,
      email,
      linked_id,
      link_precedence,
      created_at,
      updated_at,
      deleted_at
    FROM contacts
    WHERE deleted_at IS NULL
      AND (id = ANY($1) OR linked_id = ANY($1))
    ORDER BY created_at ASC
  `;
  const clustersResult = await query(clustersQuery, [primaryIdList]);
  const clusters = buildContactDocList(clustersResult.rows);

  // Determine canonical primary: oldest among the primary rows in these clusters.
  const primaries = clusters.filter((c) => c.linkPrecedence === "primary");
  const canonicalPrimary =
    primaries.sort(sortByCreatedAtAsc)[0] ?? clusters.sort(sortByCreatedAtAsc)[0];
  const canonicalPrimaryId = canonicalPrimary.id;

  // Normalize: make sure canonical is primary, others point to it.
  await query(
    `UPDATE contacts
     SET link_precedence = 'primary', linked_id = NULL
     WHERE deleted_at IS NULL AND id = $1`,
    [canonicalPrimaryId]
  );

  // Demote any other primaries to secondary
  await query(
    `UPDATE contacts
     SET link_precedence = 'secondary', linked_id = $1
     WHERE deleted_at IS NULL
       AND id != $1
       AND id = ANY($2)
       AND link_precedence = 'primary'`,
    [canonicalPrimaryId, primaryIdList]
  );

  // Ensure any secondaries pointing to other primaries now point to canonical
  await query(
    `UPDATE contacts
     SET linked_id = $1
     WHERE deleted_at IS NULL
       AND linked_id = ANY($2)
       AND linked_id <> $1`,
    [canonicalPrimaryId, primaryIdList]
  );

  // Reload canonical cluster after normalization
  let allResult = await query(
    `SELECT
       id,
       phone_number,
       email,
       linked_id,
       link_precedence,
       created_at,
       updated_at,
       deleted_at
     FROM contacts
     WHERE deleted_at IS NULL
       AND (id = $1 OR linked_id = $1)
     ORDER BY created_at ASC`,
    [canonicalPrimaryId]
  );
  let all = buildContactDocList(allResult.rows);

  const primaryRow = all.find((c) => c.id === canonicalPrimaryId) ?? canonicalPrimary;

  const existingEmails = new Set(all.map((c) => c.email).filter((v): v is string => !!v));
  const existingPhones = new Set(all.map((c) => c.phoneNumber).filter((v): v is string => !!v));

  const hasNewEmail = email !== null && !existingEmails.has(email);
  const hasNewPhone = phone !== null && !existingPhones.has(phone);

  // 4) If request adds new info, create secondary
  if (hasNewEmail || hasNewPhone) {
    const id = await nextSequence("contactId");
    await query(
      `INSERT INTO contacts (
         id,
         email,
         phone_number,
         linked_id,
         link_precedence,
         deleted_at
       ) VALUES ($1, $2, $3, $4, $5, NULL)`,
      [id, email, phone, canonicalPrimaryId, "secondary" as LinkPrecedence]
    );

    allResult = await query(
      `SELECT
         id,
         phone_number,
         email,
         linked_id,
         link_precedence,
         created_at,
         updated_at,
         deleted_at
       FROM contacts
       WHERE deleted_at IS NULL
         AND (id = $1 OR linked_id = $1)
       ORDER BY created_at ASC`,
      [canonicalPrimaryId]
    );
    all = buildContactDocList(allResult.rows);
  }

  // 5) Build response (primary values first, no duplicates)
  const emails = uniqInOrder([primaryRow.email, ...all.map((c) => c.email)]);
  const phoneNumbers = uniqInOrder([primaryRow.phoneNumber, ...all.map((c) => c.phoneNumber)]);

  const secondaryContactIds = all
    .filter((c) => c.linkPrecedence === "secondary")
    .map((c) => c.id);

  return {
    contact: {
      primaryContatctId: canonicalPrimaryId,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  };
}

