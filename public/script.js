// Pastikan DOM sepenuhnya dimuat sebelum menjalankan skrip
document.addEventListener("DOMContentLoaded", () => {
  // --- Elemen DOM ---
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const chatBox = document.getElementById("chat-box");
  const sendButton = document.querySelector("#chat-form button");
  const sendIcon = document.getElementById("send-icon");
  const stopIcon = document.getElementById("stop-icon");
  const sidebar = document.getElementById("sidebar");
  // Elements for sidebar header management
  const sidebarHeaderExpanded = document.getElementById(
    "sidebar-header-expanded"
  );
  const sidebarHeaderCollapsed = document.getElementById(
    "sidebar-header-collapsed"
  );
  const toggleSidebarBtnExpanded = document.getElementById(
    "toggle-sidebar-btn-expanded"
  );
  const toggleSidebarBtnCollapsed = document.getElementById(
    "toggle-sidebar-btn-collapsed"
  );
  const newChatBtn = document.getElementById("new-chat-btn");
  const newChatIconBtn = document.getElementById("new-chat-icon-btn"); // New icon button for collapsed state

  const themeToggleSwitch = document.getElementById("theme-toggle-switch"); // New switch element
  const themeLabel = document.getElementById("theme-label"); // The text label for the theme
  const chatHistoryList = document.getElementById("chat-history-list"); // Nav element itself
  const sidebarFooterDiv = document.getElementById("sidebar-footer"); // Div element for footer

  const moonIcon = document.getElementById("moon-icon");
  const sunIcon = document.getElementById("sun-icon");

  // Confirmation modal elements
  const confirmModal = document.getElementById("confirm-modal");
  const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
  const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  let chatItemToDelete = null; // Stores reference to the item to be deleted

  // --- Application State ---
  let chats = {}; // Object to hold all chat histories, e.g., { "chat-id-1": { title: "...", messages: [...] } }
  let currentChatId = null; // The ID of the currently active chat
  let currentAbortController = null; // To manage ongoing fetch requests

  // --- Helper function to manage send button state ---
  function updateSendButtonState() {
    const isSending = !stopIcon.classList.contains("hidden");
    const isInputEmpty = input.value.trim() === "";

    if (isSending) {
      // If in "stop" mode, the button should always be enabled to allow cancellation.
      sendButton.disabled = false;
      sendButton.classList.remove("opacity-50", "cursor-not-allowed");
    } else {
      // If in "send" mode, disable based on whether the input is empty.
      sendButton.disabled = isInputEmpty;
      sendButton.classList.toggle("opacity-50", isInputEmpty);
      sendButton.classList.toggle("cursor-not-allowed", isInputEmpty);
    }
  }
  // --- Local Storage & State Functions ---

  // Save all chats to localStorage
  function saveChatHistory() {
    localStorage.setItem("chatHistories", JSON.stringify(chats));
  }

  // Load all chat histories from localStorage on startup
  function loadAllChatHistories() {
    const savedChats = localStorage.getItem("chatHistories");
    if (savedChats) {
      chats = JSON.parse(savedChats);
      chatHistoryList.querySelector("ul").innerHTML = ""; // Clear list before populating
      Object.keys(chats).forEach((chatId) => {
        createChatHistoryItem(chats[chatId].title, chatId);
      });
    }
  }

  // Load a specific chat into the chat box
  function loadChat(chatId) {
    if (!chats[chatId]) return;

    currentChatId = chatId;
    chatBox.innerHTML = ""; // Clear the chat box
    chatBox.classList.remove("hidden"); // Make sure it's visible

    // Populate the chat box with messages from the selected history
    chats[chatId].messages.forEach((message) => {
      // `false` disables the typewriter effect for historical messages
      appendMessage(message.sender, message.text, false);
    });

    updateActiveChatInSidebar(chatId);
    // Scroll to the bottom after loading
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Fungsi untuk mengatur ulang input chat dan status tombol
  function resetChatState() {
    sendIcon.classList.remove("hidden");
    stopIcon.classList.add("hidden");
    input.disabled = false;
    hideTypingIndicator();
    currentAbortController = null; // Clear the controller
    updateSendButtonState(); // Re-evaluate button state after reset
  }

  // --- Event Listeners ---
  input.addEventListener("input", updateSendButtonState);
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // If the button says "Stop", it means a request is in progress
    // Clicking it again should abort the request
    if (!stopIcon.classList.contains("hidden")) {
      if (currentAbortController) {
        currentAbortController.abort(); // Abort the ongoing fetch request
        console.log("Permintaan dibatalkan oleh pengguna.");
      }
      resetChatState(); // Reset button and input state
      return; // Prevent further execution of the submit handler
    }

    const userMessage = input.value.trim();
    if (!userMessage) return;

    chatBox.classList.remove("hidden");

    appendMessage("user", userMessage);
    input.value = ""; // Clear input immediately

    // Change button to "Stop" icon and disable input
    sendIcon.classList.add("hidden");
    stopIcon.classList.remove("hidden");
    input.disabled = true;

    // Show typing indicator
    showTypingIndicator();

    // Create a new AbortController for the current request
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    try {
      // Call Gemini API to automatically generate title if it's a new chat
      if (!currentChatId) {
        const promptForTitle = `Buat satu judul singkat saja (maksimal 5 kata, tanpa penjelasan, tanpa daftar) berdasarkan pesan pertama berikut:\n"${userMessage}"\nLangsung jawab hanya dengan judul.`;

        // We can run title generation and chat response in parallel for faster UI
        const titlePromise = fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: promptForTitle }),
        }).then((res) => res.json());

        // Create new chat session immediately with a temporary title
        const newChatId = `chat-${Date.now()}`;
        currentChatId = newChatId;
        chats[newChatId] = {
          title: "Percakapan Baru...",
          messages: [],
        };
        createChatHistoryItem(chats[newChatId].title, newChatId);
        updateActiveChatInSidebar(newChatId);

        // Now, wait for the title and update it
        const titleResult = await titlePromise;
        let generatedTitle = "Percakapan Baru"; // Fallback title
        if (titleResult.reply) {
          generatedTitle = titleResult.reply.replace(/["\n]/g, "").trim();
        }
        chats[newChatId].title = generatedTitle;
        updateChatHistoryItemTitle(newChatId, generatedTitle);
        saveChatHistory();
      }

      // Save user message to history
      chats[currentChatId].messages.push({ sender: "user", text: userMessage });
      saveChatHistory();

      // Call Gemini API to generate chat response
      const history = chats[currentChatId]?.messages || [];
      const chatPayload = {
        history: history,
        message: userMessage,
      };

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatPayload),
        signal: signal,
      });

      if (!chatResponse.ok) {
        const errorData = await chatResponse.json();
        throw new Error(errorData.reply || "Server error");
      }

      const chatResult = await chatResponse.json();

      if (chatResult.reply) {
        appendMessage("bot", chatResult.reply);
        // Save bot message to history
        chats[currentChatId].messages.push({
          sender: "bot",
          text: chatResult.reply,
        });
        saveChatHistory();
      } else {
        appendMessage("bot", "Tidak ada balasan dari AI.");
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Fetch dibatalkan berhasil oleh pengguna.");
      } else {
        console.error("Error:", error);
        appendMessage("bot", `Error: ${error.message}`);
      }
    } finally {
      resetChatState();
    }
  });

  // Manage sidebar display/hide
  toggleSidebarBtnExpanded.addEventListener("click", () => {
    sidebar.classList.remove("w-64");
    sidebar.classList.add("w-16", "p-2", "items-center");

    sidebarHeaderExpanded.classList.add("hidden");
    sidebarHeaderCollapsed.classList.remove("hidden");

    chatHistoryList.classList.add(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    ); // Hide and disable interaction
    sidebarFooterDiv.classList.add(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    ); // Hide and disable interaction
  });

  toggleSidebarBtnCollapsed.addEventListener("click", () => {
    sidebar.classList.remove("w-16", "p-2", "items-center");
    sidebar.classList.add("w-64");

    sidebarHeaderExpanded.classList.remove("hidden");
    sidebarHeaderCollapsed.classList.add("hidden");

    chatHistoryList.classList.remove(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    ); // Show and enable interaction
    sidebarFooterDiv.classList.remove(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    ); // Show and enable interaction
  });

  newChatIconBtn.addEventListener("click", () => {
    newChatBtn.click(); // Trigger click on the main new chat button
  });

  // Manage dark/light mode via switch
  themeToggleSwitch.addEventListener("change", () => {
    if (themeToggleSwitch.checked) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      moonIcon.classList.remove("hidden");
      sunIcon.classList.add("hidden");
      if (themeLabel) themeLabel.textContent = "Mode Gelap";
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      moonIcon.classList.add("hidden");
      sunIcon.classList.remove("hidden");
      if (themeLabel) themeLabel.textContent = "Mode Terang";
    }
  });

  // Set initial theme based on localStorage or system preference
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add("dark");
    themeToggleSwitch.checked = true;
    moonIcon.classList.remove("hidden");
    sunIcon.classList.add("hidden");
    if (themeLabel) themeLabel.textContent = "Mode Gelap";
  } else {
    // The default state is light, so the HTML is already correct. This block is for clarity.
    if (themeLabel) themeLabel.textContent = "Mode Terang";
  }

  // Start new chat
  newChatBtn.addEventListener("click", () => {
    chatBox.innerHTML = ""; // Clear chat box
    chatBox.classList.add("hidden"); // Hide chat box again for new session
    input.value = ""; // Clear the input field
    currentChatId = null; // Reset current chat ID
    updateActiveChatInSidebar(null); // Remove active highlight
    // In a real app, you would also reset the chat history context on the server if it were stateful
    updateSendButtonState(); // Disable send button for the new empty chat
  });

  // Manage clicks on chat history items (edit title and load chat)
  chatHistoryList.addEventListener("click", (e) => {
    // Handle editing chat titles
    if (e.target.classList.contains("edit-title-btn")) {
      const listItem = e.target.closest("li");
      const chatIdToEdit = listItem.dataset.chatId;
      const titleSpan = listItem.querySelector(".chat-title");
      const currentTitle = chats[chatIdToEdit].title; // Get full title from data
      const newTitle = prompt("Masukkan judul chat baru:", currentTitle);
      if (newTitle && newTitle.trim() !== "") {
        const trimmedTitle = newTitle.trim();
        chats[chatIdToEdit].title = trimmedTitle;
        updateChatHistoryItemTitle(chatIdToEdit, trimmedTitle);
        saveChatHistory();
      }
    }
    // Handle deleting chat
    else if (e.target.classList.contains("delete-chat-btn")) {
      chatItemToDelete = e.target.closest("li");
      confirmModal.classList.remove("hidden"); // Show modal
    }
    // Handle loading a chat (placeholder)
    else if (e.target.closest("li")) {
      const listItem = e.target.closest("li");
      const chatIdToLoad = listItem.dataset.chatId;
      if (chatIdToLoad && chatIdToLoad !== currentChatId) {
        loadChat(chatIdToLoad);
      }
    }
  });

  // Event listener for Cancel button in confirmation modal
  cancelDeleteBtn.addEventListener("click", () => {
    confirmModal.classList.add("hidden"); // Hide modal
    chatItemToDelete = null; // Reset item to be deleted
  });

  // Event listener for Delete button in confirmation modal
  confirmDeleteBtn.addEventListener("click", () => {
    if (chatItemToDelete) {
      const chatIdToDelete = chatItemToDelete.dataset.chatId;
      delete chats[chatIdToDelete]; // Remove from our JS object
      saveChatHistory(); // Update localStorage

      chatItemToDelete.remove(); // Remove item from DOM

      // If the deleted chat was the active one, reset the view
      if (currentChatId === chatIdToDelete) {
        newChatBtn.click();
      }

      chatItemToDelete = null; // Reset item to be deleted
    }
    confirmModal.classList.add("hidden"); // Hide modal
  });

  // --- DOM Manipulation Functions ---

  // Function to highlight the active chat in the sidebar
  function updateActiveChatInSidebar(activeChatId) {
    const allChatItems = chatHistoryList.querySelectorAll("li");
    allChatItems.forEach((item) => {
      if (item.dataset.chatId === activeChatId) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  // --- Functions ---
  // Create new chat history item in sidebar
  function createChatHistoryItem(title, chatId) {
    const shortTitle =
      title.length > 25 ? title.substring(0, 22) + "..." : title;
    const listItem = document.createElement("li");
    // Add group class so hover state on edit/delete buttons works
    listItem.classList.add(
      "group",
      "flex",
      "items-center",
      "justify-between",
      "py-2",
      "px-3",
      "rounded-md",
      "cursor-pointer",
      "mb-1",
      "hover:bg-icon-hover-light",
      "transition-colors",
      "duration-200",
      "dark:hover:bg-icon-hover-dark"
    );
    listItem.dataset.chatId = chatId; // Add data attribute for identification
    listItem.innerHTML = `
      <span class="chat-title whitespace-nowrap overflow-hidden text-ellipsis flex-grow">${shortTitle}</span>
      <div class="flex items-center gap-1 ml-2">
          <button class="edit-title-btn bg-transparent border-none text-icon-light cursor-pointer
                         opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">
              &#9998; <!-- Pencil icon for edit -->
          </button>
          <button class="delete-chat-btn bg-transparent border-none text-red-500 cursor-pointer
                         opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">
              &#128465; <!-- Trash can icon for delete -->
          </button>
      </div>
    `;
    chatHistoryList.querySelector("ul").prepend(listItem); // Add to top of the list
  }

  function updateChatHistoryItemTitle(chatId, newTitle) {
    const listItem = chatHistoryList.querySelector(
      `li[data-chat-id="${chatId}"]`
    );
    if (listItem) {
      const titleSpan = listItem.querySelector(".chat-title");
      const shortTitle =
        newTitle.length > 25 ? newTitle.substring(0, 22) + "..." : newTitle;
      titleSpan.textContent = shortTitle;
    }
  }

  // Add message to chat box
  function appendMessage(sender, text, useTypewriter = true) {
    const msgElement = document.createElement("div");
    msgElement.classList.add(
      "message",
      sender,
      "p-3",
      "rounded-2xl",
      "max-w-4/5",
      "break-words",
      "leading-tight",
      "shadow-sm"
    );

    if (sender === "user") {
      msgElement.classList.add(
        "bg-user-msg-light",
        "text-white",
        "self-end",
        "rounded-br-none",
        "dark:bg-user-msg-dark"
      );
      msgElement.textContent = text;
      chatBox.appendChild(msgElement);
      chatBox.scrollTop = chatBox.scrollHeight;
    } else {
      // Bot message
      msgElement.classList.add(
        "bg-bot-msg-light",
        "text-bot-msg-text-light",
        "self-start",
        "rounded-bl-none",
        "dark:bg-bot-msg-dark",
        "dark:text-bot-msg-text-dark"
      );

      if (useTypewriter) {
        msgElement.textContent = ""; // Start with empty text content
        chatBox.appendChild(msgElement);

        let i = 0;
        const typingSpeed = 30; // milliseconds

        function typeWriter() {
          if (
            i < text.length &&
            chatBox.contains(msgElement) &&
            currentAbortController !== null
          ) {
            msgElement.textContent += text.charAt(i);
            i++;
            chatBox.scrollTop = chatBox.scrollHeight;
            setTimeout(typeWriter, typingSpeed);
          } else {
            renderMarkdown(msgElement, text);
          }
        }
        typeWriter();
      } else {
        // Render immediately for historical messages
        chatBox.appendChild(msgElement);
        renderMarkdown(msgElement, text);
      }
    }
  }

  // Helper to render markdown content
  function renderMarkdown(element, markdownText) {
    if (typeof marked !== "undefined") {
      const markedOptions = {
        gfm: true,
        breaks: true,
        highlight: function (code, lang) {
          if (typeof hljs !== "undefined" && hljs.getLanguage(lang)) {
            return hljs.highlight(code, {
              language: lang,
              ignoreIllegals: true,
            }).value;
          }
          return hljs.highlightAuto(code).value;
        },
      };
      element.innerHTML = marked.parse(markdownText, markedOptions);
      applyMarkdownStyling(element);
    } else {
      // Fallback if marked.js is not available
      element.textContent = markdownText;
    }
    // Scroll again in case rendering changes height
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Apply Tailwind styles to rendered Markdown elements
  function applyMarkdownStyling(element) {
    // Code blocks
    element.querySelectorAll("pre").forEach((pre) => {
      pre.classList.add("rounded-md", "overflow-hidden", "my-3", "shadow");
    });
    element.querySelectorAll("code").forEach((code) => {
      if (code.closest("pre")) {
        // Code within pre block
        code.classList.add("font-mono", "bg-transparent", "p-0", "text-sm");
      } else {
        // Inline code
        code.classList.add(
          "font-mono",
          "bg-gray-300",
          "dark:bg-gray-600",
          "text-gray-900",
          "dark:text-gray-100",
          "px-1",
          "py-0.5",
          "rounded-sm",
          "text-sm"
        );
      }
    });

    // Headings
    element
      .querySelectorAll("h1")
      .forEach((h) => h.classList.add("text-2xl", "font-bold", "mt-4", "mb-2"));
    element
      .querySelectorAll("h2")
      .forEach((h) =>
        h.classList.add("text-xl", "font-bold", "mt-3", "mb-1.5")
      );
    element
      .querySelectorAll("h3")
      .forEach((h) =>
        h.classList.add("text-lg", "font-semibold", "mt-2.5", "mb-1")
      );
    element
      .querySelectorAll("h4")
      .forEach((h) =>
        h.classList.add("text-base", "font-semibold", "mt-2", "mb-0.5")
      );
    element
      .querySelectorAll("h5")
      .forEach((h) => h.classList.add("text-base", "font-medium", "mt-1.5"));
    element
      .querySelectorAll("h6")
      .forEach((h) => h.classList.add("text-sm", "font-medium", "mt-1"));

    // Paragraphs
    element.querySelectorAll("p").forEach((p) => p.classList.add("mb-2"));

    // Lists
    element
      .querySelectorAll("ul")
      .forEach((ul) => ul.classList.add("list-disc", "list-inside", "mb-2"));
    element
      .querySelectorAll("ol")
      .forEach((ol) => ol.classList.add("list-decimal", "list-inside", "mb-2"));

    // Blockquotes
    element.querySelectorAll("blockquote").forEach((bq) => {
      bq.classList.add(
        "border-l-4",
        "border-gray-400",
        "pl-3",
        "italic",
        "text-gray-600",
        "my-3",
        "dark:border-gray-500",
        "dark:text-gray-400"
      );
    });

    // Tables
    element.querySelectorAll("table").forEach((table) => {
      table.classList.add("w-full", "border-collapse", "my-3", "shadow-sm");
    });
    element.querySelectorAll("th, td").forEach((cell) => {
      cell.classList.add(
        "border",
        "border-gray-300",
        "dark:border-gray-600",
        "py-2",
        "px-3",
        "text-left"
      );
    });
    element.querySelectorAll("th").forEach((th) => {
      th.classList.add(
        "bg-gray-100",
        "dark:bg-gray-700",
        "font-semibold",
        "text-gray-700",
        "dark:text-gray-200"
      );
    });
  }

  // Display typing indicator
  function showTypingIndicator() {
    const indicator = document.createElement("div");
    // Give it 'message' and 'bot' classes to align it to the left like a bot message
    indicator.classList.add(
      "message",
      "bot",
      "typing-indicator",
      "py-4",
      "px-5",
      "rounded-2xl",
      "self-start",
      "shadow-sm",
      "flex",
      "items-center",
      "gap-1.5"
    );
    indicator.innerHTML = `
      <span class="h-2 w-2 mx-0.5 bg-gray-400 dark:bg-gray-500 rounded-full inline-block animate-bounce-dot" style="animation-delay: -0.32s;"></span>
      <span class="h-2 w-2 mx-0.5 bg-gray-400 dark:bg-gray-500 rounded-full inline-block animate-bounce-dot" style="animation-delay: -0.16s;"></span>
      <span class="h-2 w-2 mx-0.5 bg-gray-400 dark:bg-gray-500 rounded-full inline-block animate-bounce-dot" style="animation-delay: 0s;"></span>
    `;
    chatBox.appendChild(indicator);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Hide typing indicator
  function hideTypingIndicator() {
    const indicator = chatBox.querySelector(".typing-indicator");
    if (indicator) {
      chatBox.removeChild(indicator);
    }
  }

  // Add bounce animation for typing dots
  const styleTag = document.createElement("style");
  styleTag.innerHTML = `
    @keyframes bounce-dot {
      0%, 80%, 100% {
        transform: scale(0);
      }
      40% {
        transform: scale(1);
      }
    }
    .animate-bounce-dot {
      animation: bounce-dot 1.4s infinite ease-in-out both;
    }
    /* Style for the custom switch dot */
    .dot {
      transform: translateX(0);
    }
    #theme-toggle-switch:checked ~ .dot {
      transform: translateX(100%); /* Moves the dot to the right */
    }
  `;
  document.head.appendChild(styleTag);

  // Add active class styling
  const styleTagActive = document.createElement("style");
  styleTagActive.innerHTML = `
    #chat-history-list li.active {
      background-color: #e9ecef; /* icon-hover-light */
    }
    .dark #chat-history-list li.active {
      background-color: #3a3a3a; /* icon-hover-dark */
    }
  `;
  document.head.appendChild(styleTagActive);

  // Initial load of all chat histories from localStorage
  loadAllChatHistories();

  // Set the initial state of the send button to disabled
  updateSendButtonState();
});
