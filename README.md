## Bitespeed /identify API

Minimal implementation of the Bitespeed identity consolidation API using **Node.js + TypeScript + Express** with a **SQLite (SQL) database**.

### Tech stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express
- **Database**: MongoDB (via `mongoose`)

### Setup

```bash
npm install
npm run dev
```

The server starts on port `3000` by default.

### Database

You need a running MongoDB instance.

- **Default connection**: `mongodb://127.0.0.1:27017/bitespeed`
- **Override** with environment variable:
  - `MONGODB_URI=mongodb://127.0.0.1:27017/bitespeed`

The service stores contacts in a `contacts` collection with fields matching the assignment model:

- `id` (auto-increment number)
- `phoneNumber` (nullable)
- `email` (nullable)
- `linkedId` (nullable, numeric id of primary)
- `linkPrecedence` (`"primary"` or `"secondary"`)
- `createdAt`
- `updatedAt`
- `deletedAt` (nullable)

### API

**Endpoint**: `POST /identify`

**Body**:

```json
{
  "email": "test@example.com",
  "phoneNumber": "1234567890"
}
```

At least one of `email` or `phoneNumber` must be provided.

**Response**:

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["test@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": []
  }
}
```

The implementation follows the business rules from the assignment:

- Contacts are related if email **or** phone number matches.
- Only one primary contact per customer (oldest `createdAt`).
- Other related contacts are normalized to secondary and linked to the primary.
- New information (new email/phone) for an existing customer creates a secondary contact.
- No matching contact creates a new primary.
- Ignoring `deletedAt` contacts.
- Endpoint is idempotent for identical requests.

