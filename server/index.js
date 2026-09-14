require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const memoryFile = path.join(__dirname, "memory.json");

function loadMemories() {
  try {
    const data = JSON.parse(fs.readFileSync(memoryFile, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveMemories(memories) {
  fs.writeFileSync(
    memoryFile,
    JSON.stringify(memories, null, 2)
  );
}

const sensitiveWords = [
  "password",
  "api key",
  "secret key",
  "otp",
  "credit card",
  "bank account",
  "suicide",
  "self harm",
  "maar pari",
  "mar pari"
];

function isSensitive(text) {
  const lower = text.toLowerCase();
  return sensitiveWords.some(word => lower.includes(word));
}

app.get("/api/memories", (req, res) => {
  res.json({ memories: loadMemories() });
});

app.delete("/api/memories/:index", (req, res) => {
  const index = Number(req.params.index);
  const memories = loadMemories();

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= memories.length
  ) {
    return res.status(400).json({
      error: "Invalid memory"
    });
  }

  memories.splice(index, 1);
  saveMemories(memories);

  res.json({ memories });
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    const history = Array.isArray(req.body.history)
      ? req.body.history
      : [];

    if (!message) {
      return res.status(400).json({
        error: "Message required"
      });
    }

    const lower = message.toLowerCase();

    const wantsMemory =
      lower.includes("yaad rakho") ||
      lower.includes("yaad rakhna") ||
      lower.includes("save kar lo") ||
      lower.includes("save karo") ||
      lower.includes("remember this") ||
      lower.includes("remember");

    if (wantsMemory && !isSensitive(message)) {
      const memoryText = message
        .replace(
          /^(remember|save|yaad rakho|yaad rakhna|save kar lo|save karo)\s*:?\s*/i,
          ""
        )
        .trim();

      if (memoryText) {
        const memories = loadMemories();

        if (!memories.includes(memoryText)) {
          memories.push(memoryText);
          saveMemories(memories);
        }
      }
    }

    const memories = loadMemories();

    const memoryText = memories.length
      ? `Saved memories:\n${memories
          .map((m, i) => `${i + 1}. ${m}`)
          .join("\n")}`
      : "Saved memories: None";

    const conversation = history
      .slice(-20)
      .map(item => {
        const role =
          item.role === "assistant"
            ? "AI"
            : "User";

        return `${role}: ${String(item.content || "")}`;
      })
      .join("\n");

    const prompt = `${memoryText}

Conversation so far:
${conversation}

User: ${message}

Use saved memories when relevant.
Do not invent memories.
If the user asks what you remember, use the saved memories above.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: prompt,
      store: false
    });

    res.json({
      reply: response.output_text || "No response"
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message || "Server error"
    });
  }
});

if (require.main === module) {
app.listen(process.env.PORT || 3000, () => {
  console.log(
    `Running on http://localhost:${process.env.PORT || 3000}`
  );
});

module.exports = app;
