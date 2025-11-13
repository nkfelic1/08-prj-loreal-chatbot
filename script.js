/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Helper to append messages to the chat window
function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "ai") + " msg-enter";

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  if (role === "ai") {
    const img = document.createElement("img");
    img.src = "img/loreal-logo.png";
    img.alt = "L'Oréal";
    img.className = "avatar-img";
    avatar.appendChild(img);
  } else {
    // simple user avatar (initials) — can be replaced with user image later
    const userDot = document.createElement("div");
    userDot.className = "avatar-user";
    userDot.textContent = "You";
    avatar.appendChild(userDot);
  }

  const content = document.createElement("div");
  content.className = "msg-content";
  // Render richer markup: escape, then apply lightweight markdown (bold/italic)
  // and linkification for URLs.
  content.innerHTML = renderContent(text);

  // Optional timestamp
  const ts = document.createElement("div");
  ts.className = "msg-ts";
  ts.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // build order: for ai -> avatar, content, ts; for user -> content, avatar, ts (right aligned)
  if (role === "ai") {
    el.appendChild(avatar);
    el.appendChild(content);
    el.appendChild(ts);
  } else {
    el.appendChild(content);
    el.appendChild(avatar);
    el.appendChild(ts);
  }

  chatWindow.appendChild(el);
  // keep scroll at bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
  // remove enter class after animation completes to avoid re-triggering
  setTimeout(() => el.classList.remove("msg-enter"), 300);
}

// Conversation context (tracks user name and recent user questions)
const conversationContext = {
  userName: null,
  pastQuestions: [], // keep recent user messages
};

/**
 * Try to extract the user's name from natural phrases like "my name is..." or "I'm ..."
 * If found, store in conversationContext.userName and return the detected name.
 */
function updateContextFromMessage(text) {
  if (!text) return null;
  // simple patterns: "my name is NAME", "I'm NAME", "I am NAME"
  const namePatterns = [
    /my name is\s+([A-Za-z\-']{2,50})/i,
    /i'm\s+([A-Za-z\-']{2,50})/i,
    /i am\s+([A-Za-z\-']{2,50})/i,
  ];

  for (const re of namePatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const name = m[1].trim();
      conversationContext.userName = name;
      return name;
    }
  }
  return null;
}

function addUserQuestionToContext(text) {
  if (!text) return;
  conversationContext.pastQuestions.push({ text, time: Date.now() });
  // keep last 20 questions to avoid excessive context
  if (conversationContext.pastQuestions.length > 20) {
    conversationContext.pastQuestions.shift();
  }
}

function buildContextSystemMessage() {
  const parts = [];
  if (conversationContext.userName)
    parts.push(`user_name: ${conversationContext.userName}`);
  if (conversationContext.pastQuestions.length) {
    const last = conversationContext.pastQuestions.slice(-5).map((q) => q.text);
    parts.push(`recent_user_questions: ${last.join(" || ")}
`);
  }
  if (!parts.length) return null;
  return {
    role: "system",
    content: `Conversation context:\n${parts.join("\n")}`,
  };
}

// --- Rich text helpers ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function linkify(text) {
  // simple URL regex
  const urlRegex =
    /((https?:\/\/|www\.)[\w\-@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/gi;
  return text.replace(urlRegex, (match) => {
    const href = match.startsWith("http") ? match : "http://" + match;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

function markdownToHtml(text) {
  // bold **text**
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // italic *text*
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // convert line breaks to <br>
  text = text.replace(/\n/g, "<br>");
  return text;
}

function renderContent(raw) {
  // escape first to avoid injected HTML, then allow our simple formatting
  const escaped = escapeHtml(raw);
  const withLinks = linkify(escaped);
  const withMd = markdownToHtml(withLinks);
  return withMd;
}

// Set initial message
appendMessage("ai", "👋 Hello! How can I help you today?");

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  // show user's message immediately
  appendMessage("user", text);
  // update conversational context with user's message
  addUserQuestionToContext(text);
  const detectedName = updateContextFromMessage(text);
  if (detectedName) {
    // acknowledge name immediately in UI
    appendMessage(
      "ai",
      `Nice to meet you, ${detectedName}! How can I help today?`
    );
  }
  userInput.value = "";

  // disable submit while waiting
  const submitBtn = chatForm.querySelector("button");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const reply = await sendMessageToOpenAI(text);
    appendMessage("ai", reply);
  } catch (err) {
    console.error(err);
    appendMessage(
      "ai",
      "Sorry — I couldn't reach the API. Please try again later."
    );
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    userInput.focus();
  }
});

const chatHistory = [
  {
    role: "system",
    content: `You are a virtual beauty specialist dedicated to assisting users with questions about L'Oreal products, beauty routines, and recommendations. Respond only to inquiries directly related to L'Oreal products, beauty care, or beauty-related routines. For questions outside these topics, politely decline to answer and gently redirect the user toward L'Oreal or beauty-related matters. Maintain a positive, encouraging attitude, and always suggest specific L'Oreal products where appropriate to help customers achieve their most beautiful selves. Keep responses concise—short to medium length (2-5 sentences).

- **Acceptable Topics**: L'Oreal products (all ranges), product comparisons, beauty routines using L'Oreal, skin/hair concerns addressed by L'Oreal lines, choosing best L'Oreal items, and general beauty advice that includes L'Oreal.
- **Unacceptable Topics**: Non-beauty-related questions, non-L'Oreal product inquiries, medical or legal advice, personal matters unrelated to beauty.
- **Polite Refusal**: Gently refuse off-topic questions and encourage beauty-related discussion.

Before answering, always:
1. Identify if the user’s question is related to L'Oreal products, beauty, or routines.
2. If unrelated, respond politely by declining and steering conversation back to beauty/L'Oreal.
3. If related, provide a positive and enthusiastic response, boldly recommending relevant L'Oreal products.
4. Keep your response within 2-5 sentences.

**Output format**: The response should be a single, concise paragraph (2-5 sentences), written in a friendly, professional style.

---

## Examples

**Example 1**
- **User input**: Which L'Oreal shampoo works best for dry hair?
- **Output**: For dry hair, I'd recommend the L'Oreal Paris Elvive Extraordinary Oil Shampoo—it deeply nourishes and hydrates, leaving your hair soft and beautifully shiny. It's perfect if you're looking for a boost of moisture!

**Example 2**
- **User input**: Can you tell me who won the World Cup in 2010?
- **Output**: I'm here to help with all your beauty needs, especially anything related to L'Oreal products or routines. If you have a beauty-related question or want to know about L'Oreal's best products, please let me know—I’d love to help you find your perfect match!

**Example 3**
- **User input**: What is a good L'Oreal face serum for anti-aging?
- **Output**: For anti-aging benefits, I strongly recommend the L'Oreal Paris Revitalift 1.5% Pure Hyaluronic Acid Serum. It visibly plumps and smooths your skin for a youthful, radiant look!

*(For full-length conversations, always keep responses to 2-5 sentences; expand details only where specific product recommendations are required.)*

---

**Important reminders**:  
Only answer beauty- or L'Oreal-related questions; always suggest a specific L'Oreal product or routine when possible; politely steer non-beauty questions back to topic; keep tone positive and concise.`,
  },
];

async function sendMessageToOpenAI(message) {
  if (typeof OPENAI_API_KEY === "undefined" || !OPENAI_API_KEY) {
    throw new Error(
      "OpenAI API key is not defined. Please set your API key in secrets.js."
    );
  }

  const url = "https://loreal-worker.nkfelic1.workers.dev/";

  // Build messages: include base chatHistory (system prompt), then any context summary, then the user's message
  const messages = chatHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const contextMsg = buildContextSystemMessage();
  if (contextMsg) {
    // append context as an additional system message so the assistant can use it
    messages.push(contextMsg);
  }
  messages.push({ role: "user", content: message });

  const body = {
    model: "gpt-4o",
    messages: messages,
    max_tokens: 500,
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };
  // Debug: log outgoing body so we can confirm the client is sending valid JSON
  console.debug("Sending worker request body:", body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorDetails}`
    );
  }

  const data = await response.json();
  const assistantText = data.choices[0].message.content.trim();

  // Save conversation to history
  chatHistory.push({ role: "user", content: message });
  chatHistory.push({ role: "assistant", content: assistantText });

  return assistantText;
}
