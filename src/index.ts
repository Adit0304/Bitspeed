import "dotenv/config";
import express, { Request, Response } from "express";
import { identify } from "./identify";
import { connectPostgres } from "./db";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.post("/identify", (req: Request, res: Response) => {
  try {
    let { email = null, phoneNumber = null } = req.body ?? {};

    if (email === undefined) email = null;
    if (phoneNumber === undefined) phoneNumber = null;

    if (email == null && phoneNumber == null) {
      return res.status(400).json({
        error: "At least one of email or phoneNumber is required",
      });
    }

    identify({ email, phoneNumber })
      .then((result) => res.json(result))
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
      });
    return;
  } catch (err) {
    // In a real app you'd have better logging + error handling
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

async function start() {
  await connectPostgres();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});

