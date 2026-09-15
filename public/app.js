const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("message");
const newChatBtn = document.getElementById("newChat");

let chats = JSON.parse(localStorage.getItem("myChats") || "[]");
let currentChat = null;

let deviceId = localStorage.getItem("myDeviceId");
if (!deviceId) {
  deviceId = crypto.randomUUID();
  localStorage.setItem("myDeviceId", deviceId);
}

async function loadChatHistoryFromServer() {
  try {
    const deviceId = localStorage.getItem("myDeviceId");
    if (!deviceId) return;

    const r = await fetch("/api/chat-history", {
      headers: { "x-device-id": deviceId }
    });

    const data = await r.json();
    const rows = data.history || [];
    if (!rows.length) return;

    const grouped = {};

    rows.forEach(row => {
      if (!row.chat_id) return;

      if (!grouped[row.chat_id]) {
        grouped[row.chat_id] = {
          chatId: row.chat_id,
          title: row.title || "New Chat",
          messages: "",
          history: []
        };
      }

      grouped[row.chat_id].history.push({
        role: row.role,
        content: row.message
      });

      const who = row.role === "user" ? "You" : "AI";
      grouped[row.chat_id].messages +=
        "<p><b>" + safeText(who) + ":</b> " +
        safeText(row.message) + "</p>";
    });

    chats = Object.values(grouped);
    save();
    renderSidebar();

    if (chats.length > 0) {
      currentChat = 0;
      chat.innerHTML = chats[0].messages || "";
    }
  } catch (error) {
    console.error("Chat history load failed:", error);
  }
}

function save() {
  localStorage.setItem("myChats", JSON.stringify(chats));
}

function safeText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderSidebar() {
  document.querySelectorAll(".chat-row").forEach(x => x.remove());

  chats.forEach((item, index) => {
    if (!item.chatId) item.chatId = crypto.randomUUID();
    const row = document.createElement("div");
    row.className = "chat-row";

    const open = document.createElement("button");
    open.className = "chat-item";
    open.textContent = item.title || "New Chat";

    open.onclick = () => {
      currentChat = index;
      chat.innerHTML = item.messages || "";
    };

    const rename = document.createElement("button");
    rename.className = "rename-chat";
    rename.textContent = "✏️";

    rename.onclick = e => {
      e.stopPropagation();

      const name = window.prompt(
        "Enter chat name:",
        item.title || "New Chat"
      );

      if (name && name.trim()) {
        item.title = name.trim();
        save();
        renderSidebar();
      }
    };

    const del = document.createElement("button");
    del.className = "delete-chat";
    del.textContent = "🗑️";

    del.onclick = e => {
      e.stopPropagation();

      if (window.confirm("Delete this chat?")) {
        chats.splice(index, 1);

        if (currentChat === index) {
          currentChat = null;
          chat.innerHTML = "";
        } else if (currentChat > index) {
          currentChat--;
        }

        save();
        renderSidebar();
      }
    };

    row.appendChild(open);
    row.appendChild(rename);
    row.appendChild(del);

    newChatBtn.parentNode.insertBefore(
      row,
      newChatBtn.nextSibling
    );
  });
}

function createChat() {
  chats.unshift({
    chatId: crypto.randomUUID(),
    title: "New Chat",
    messages: "",
    history: []
  });

  currentChat = 0;
  chat.innerHTML = "";

  save();
  renderSidebar();
}

function ensureChat() {
  if (currentChat === null) {
    createChat();
  }

  if (!Array.isArray(chats[currentChat].history)) {
    chats[currentChat].history = [];
  }
}

function addMessage(who, text) {
  ensureChat();

  const p = document.createElement("p");

  p.innerHTML =
    "<b>" +
    safeText(who) +
    ":</b> " +
    safeText(text);

  chat.appendChild(p);

  if (
    who === "You" &&
    chats[currentChat].title === "New Chat"
  ) {
    chats[currentChat].title =
      text.slice(0, 30);
  }

  chats[currentChat].messages =
    chat.innerHTML;

  save();
  renderSidebar();
}

async function showMemories() {
  try {
    const deviceId = localStorage.getItem("myDeviceId");
      const r = await fetch("/api/memories", {
        headers: {
          "x-device-id": deviceId
        }
      });
    const data = await r.json();

    const memories = data.memories || [];

    if (!memories.length) {
      window.alert("No saved memories.");
      return;
    }

    let text = "🧠 Saved Memories\n\n";

    memories.forEach((memory, index) => {
      text += `${index + 1}. ${memory.memory}\n`;
    });

    text +=
      "\nDelete a memory by entering its number.\nCancel = keep all.";

    const answer = window.prompt(text);

    if (!answer) return;

    const number = Number(answer);
    const index = number - 1;

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < memories.length
    ) {
      const ok = window.confirm(
        "Delete this memory?\n\n" +
        memories[index].memory
      );

      if (ok) {
        await fetch(
          "/api/memories/" + index,
          {
            method: "DELETE"
          }
        );

        window.alert("Memory deleted.");
      }
    } else {
      window.alert("Invalid memory number.");
    }

  } catch {
    window.alert("Memory connection failed.");
  }
}

const memoryBtn = document.createElement("button");
memoryBtn.textContent = "🧠 Memory";
memoryBtn.style.width = "100%";
memoryBtn.style.margin = "8px 0";
memoryBtn.style.padding = "10px";
memoryBtn.style.cursor = "pointer";

newChatBtn.parentNode.insertBefore(
  memoryBtn,
  newChatBtn
);

memoryBtn.onclick = showMemories;

newChatBtn.onclick = createChat;

renderSidebar();

if (chats.length > 0) {
  currentChat = 0;

  chat.innerHTML =
    chats[0].messages || "";

  if (!Array.isArray(chats[0].history)) {
    chats[0].history = [];
  }
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  const message =
    input.value.trim();

  if (!message) return;

  ensureChat();

  const history =
    [...(chats[currentChat].history || [])];

  addMessage("You", message);

  chats[currentChat].history.push({
    role: "user",
    content: message
  });

  input.value = "";

  addMessage("AI", "Thinking...");

  try {
    const r = await fetch(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": localStorage.getItem("myDeviceId") || (() => {
            const id = crypto.randomUUID();
            localStorage.setItem("myDeviceId", id);
            return id;
          })()
        },
        body: JSON.stringify({
          message: message,
          history: history,
          chatId: chats[currentChat].chatId,
          title: chats[currentChat].title || "New Chat"
        })
      }
    );

    const data = await r.json();

    const reply =
      data.reply ||
      data.error ||
      "No response";

    const last =
      chat.lastElementChild;

    last.innerHTML =
      "<b>AI:</b> " +
      safeText(reply);

    chats[currentChat].history.push({
      role: "assistant",
      content: reply
    });

    chats[currentChat].messages =
      chat.innerHTML;

    save();

  } catch (err) {
    chat.lastElementChild.innerHTML =
      "<b>AI:</b> Connection failed";

    chats[currentChat].messages =
      chat.innerHTML;

    save();
  }
});
