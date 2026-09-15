require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const express = require("express");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());
app.use(express.static(require("path").join(__dirname, "..", "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const memoryFile = path.join(__dirname, "memory.json");

async function loadChatHistory(deviceId) {
  const { data, error } = await supabase
    .from("chat_history")
    .select("id, chat_id, title, role, message, created_at")
    .eq("device_id", deviceId)
    .order("id", { ascending: true });

  if (error) {
    console.error("Chat history load error:", error);
    return [];
  }

  return data || [];
}

async function saveChatMessage(deviceId, chatId, title, role, message) {
  const { error } = await supabase
    .from("chat_history")
    .insert({
      device_id: deviceId,
      chat_id: chatId,
      title: title,
      role: role,
      message: message
    });

  if (error) {
    console.error("Chat history save error:", error);
  }
}

async function loadMemories(deviceId) {
  const { data, error } = await supabase
    .from("memories")
    .select("id, memory")
    .eq("device_id", deviceId)
    .order("id", { ascending: true });

  if (error) {
    console.error("Supabase load error:", error);
    return [];
  }

  return data || [];
}

async function saveMemory(deviceId, memory) {
  const { error } = await supabase
    .from("memories")
    .insert({
      device_id: deviceId,
      memory: memory
    });

  if (error) {
    console.error("Supabase save error:", error);
  }
}

async function deleteMemory(deviceId, id) {
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("device_id", deviceId);

  if (error) {
    console.error("Supabase delete error:", error);
  }
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

app.get("/api/memories", async (req, res) => {
  const deviceId = req.headers["x-device-id"];

  if (!deviceId) {
    return res.status(400).json({ error: "Device ID required" });
  }

  const memories = await loadMemories(deviceId);

  res.json({
    memories: memories.map(row => ({
      id: row.id,
      memory: row.memory
    }))
  });
});

app.delete("/api/memories/:id", async (req, res) => {
  const deviceId = req.headers["x-device-id"];
  const id = Number(req.params.id);

  if (!deviceId || !Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid memory" });
  }

  await deleteMemory(deviceId, id);

  const memories = await loadMemories(deviceId);

  res.json({
    memories: memories.map(row => ({
      id: row.id,
      memory: row.memory
    }))
  });
});

app.get("/api/chat-history", async (req, res) => {
  try {
    const deviceId = req.headers["x-device-id"];

    if (!deviceId) {
      return res.status(400).json({
        error: "Device ID required"
      });
    }

    const history = await loadChatHistory(deviceId);

    res.json({
      history: history
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message || "Server error"
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    const deviceId = req.headers["x-device-id"];
    const chatId = String(req.body.chatId || "").trim();
    const title = String(req.body.title || "New Chat").trim();

    if (!deviceId) {
      return res.status(400).json({
        error: "Device ID required"
      });
    }

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
      lower.includes("remember") ||
      /\bmera naam (?:hai|he)\b/i.test(lower) ||
      /\bmy name is\b/i.test(lower) ||
      /\bmera favou?rite (?:colour|color|fruit) .+? (?:hai|he)\b/i.test(lower) ||
      /\bmere favou?rite (?:colour|color|fruit) .+? (?:hai|he)\b/i.test(lower);

    if (wantsMemory && !isSensitive(message)) {
      const memoryTextToSave = message
        .replace(
          /^(remember|save|yaad rakho|yaad rakhna|save kar lo|save karo)\s*:?\s*/i,
          ""
        )
        .trim();

      if (memoryTextToSave) {
        if (chatId) {
          await saveChatMessage(
            deviceId,
            chatId,
            title,
            "user",
            message
          );
        }

        const memories = await loadMemories(deviceId);

        let categoryRegex = null;

        if (/\bmera naam\b|\bmy name is\b/i.test(lower)) {
          categoryRegex = /^\s*(mera naam|my name is)\b/i;
        } else if (/\bfavou?rite (?:colour|color)\b/i.test(lower)) {
          categoryRegex = /^\s*(mera|mere) favourite (?:colour|color)\b/i;
        } else if (/\bfavou?rite fruit\b/i.test(lower)) {
          categoryRegex = /^\s*(mera|mere) favourite fruit\b/i;
        }

        if (categoryRegex) {
          for (const row of memories) {
            if (categoryRegex.test(row.memory)) {
              await deleteMemory(deviceId, row.id);
            }
          }
        }

        const latestMemories = await loadMemories(deviceId);
        const exists = latestMemories.some(
          row => row.memory === memoryTextToSave
        );

        if (!exists) {
          await saveMemory(deviceId, memoryTextToSave);
        }
      }
    }

    const memories = await loadMemories(deviceId);

    const memoryText = memories.length
      ? `Saved memories:\n${memories
          .map((m, i) => `${i + 1}. ${m.memory}`)
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

Use the saved memories above as real persistent memories.
If the user asks what you remember, use the saved memories above.
If a new memory was saved, confirm that it has been saved.
Never say that permanent memory is unavailable when saved memories are provided.
Do not invent memories.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: prompt,
      store: false
    });

    const reply = response.output_text || "No response";

    if (chatId) {
      await saveChatMessage(
        deviceId,
        chatId,
        title,
        "assistant",
        reply
      );
    }

    res.json({
      reply: reply
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

}
module.exports = app;
