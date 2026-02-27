export type LinkPrecedence = "primary" | "secondary";

export interface ContactDoc {
  id: number;
  phoneNumber: string | null;
  email: string | null;
  linkedId: number | null;
  linkPrecedence: LinkPrecedence;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ContactRow {
  id: number;
  phone_number: string | null;
  email: string | null;
  linked_id: number | null;
  link_precedence: LinkPrecedence;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export function mapContactRow(row: ContactRow): ContactDoc {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    email: row.email,
    linkedId: row.linked_id,
    linkPrecedence: row.link_precedence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

