// Pastikan DOM sepenuhnya dimuat sebelum menjalankan skrip
document.addEventListener("DOMContentLoaded", () => {
  // --- Elemen DOM ---
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const mainContainer = document.getElementById("main-container");
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

  const searchContainer = document.getElementById("search-container");
  const searchHistoryInput = document.getElementById("search-history-input");

  const themeToggleSwitch = document.getElementById("theme-toggle-switch"); // New switch element
  const themeLabel = document.getElementById("theme-label"); // The text label for the theme
  const chatHistoryList = document.getElementById("chat-history-list"); // Nav element itself
  const welcomeView = document.getElementById("welcome-view");
  const sidebarFooterDiv = document.getElementById("sidebar-footer"); // Div element for footer

  const moonIcon = document.getElementById("moon-icon");
  const sunIcon = document.getElementById("sun-icon");

  // Confirmation modal elements
  const confirmModal = document.getElementById("confirm-modal");
  const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
  const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  // Elements for responsive behavior
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  let chatItemToDelete = null; // Stores reference to the item to be deleted

  // --- Application State ---
  let chats = {}; // Object to hold all chat histories, e.g., { "chat-id-1": { title: "...", messages: [...] } }
  let currentChatId = null; // The ID of the currently active chat
  let currentAbortController = null; // To manage ongoing fetch requests
  let isSidebarCollapsed = false; // Tracks the permanent collapsed state for hover functionality

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

    // Populate the chat box with messages from the selected history
    chats[chatId].messages.forEach((message) => {
      appendMessage(message.sender, message.text);
    });
    toggleChatView(true); // Switch to active chat view

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
      stopGeneration();
      return; // Prevent further execution of the submit handler
    }

    const userMessage = input.value.trim();
    if (!userMessage) return;

    // Add user message to UI and history, then fetch response
    sendMessage(userMessage);
  });

  // --- Sidebar Management ---

  function collapseSidebar() {
    sidebar.classList.remove("w-64");
    sidebar.classList.add("w-16", "p-2", "items-center");
    searchContainer.classList.add("hidden"); // Sembunyikan search bar saat collapse
    sidebarHeaderExpanded.classList.add("hidden");
    sidebarHeaderCollapsed.classList.remove("hidden");
    chatHistoryList.classList.add("opacity-0", "pointer-events-none", "h-0", "overflow-hidden", "p-0");
    sidebarFooterDiv.classList.add("opacity-0", "pointer-events-none", "h-0", "overflow-hidden", "p-0");
  }

  function expandSidebar() {
    sidebar.classList.remove("w-16", "p-2", "items-center");
    sidebar.classList.add("w-64");
    searchContainer.classList.remove("hidden"); // Tampilkan search bar saat expand
    sidebarHeaderExpanded.classList.remove("hidden");
    sidebarHeaderCollapsed.classList.add("hidden");
    chatHistoryList.classList.remove("opacity-0", "pointer-events-none", "h-0", "overflow-hidden", "p-0");
    sidebarFooterDiv.classList.remove("opacity-0", "pointer-events-none", "h-0", "overflow-hidden", "p-0");
  }

  // Manage sidebar display/hide via clicks
  toggleSidebarBtnExpanded.addEventListener("click", () => {
    // If the sidebar is already meant to be collapsed (i.e., we are in a hover-to-expand state),
    // then this click should make it permanently expanded.
    if (isSidebarCollapsed) {
      isSidebarCollapsed = false; // Cancel the collapse state. The sidebar will now stay expanded on mouseleave.
    } else {
      // Otherwise, this is a normal collapse action from an already expanded state.
      collapseSidebar();
      isSidebarCollapsed = true;
    }
  });

  toggleSidebarBtnCollapsed.addEventListener("click", () => {
    expandSidebar();
    isSidebarCollapsed = false;
  });

  // Add hover effect for minimized sidebar
  sidebar.addEventListener("mouseenter", () => {
    if (isSidebarCollapsed) {
      expandSidebar();
    }
  });

  sidebar.addEventListener("mouseleave", () => {
    if (isSidebarCollapsed) {
      collapseSidebar();
    }
  });

  newChatIconBtn.addEventListener("click", () => {
    newChatBtn.click(); // Trigger click on the main new chat button
  });

  // --- Chat History Filtering ---
  searchHistoryInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const chatItems = chatHistoryList.querySelectorAll("li");

    chatItems.forEach((item) => {
      const chatId = item.dataset.chatId;
      // Get the full title from the `chats` object for accurate searching
      const chatTitle = chats[chatId]?.title.toLowerCase() || "";
      if (chatTitle.includes(searchTerm)) {
        item.style.display = "flex"; // Use 'flex' as it's a flex container
      } else {
        item.style.display = "none";
      }
    });
  });

  // Manage dark/light mode via switch
  themeToggleSwitch.addEventListener("change", () => {
    if (themeToggleSwitch.checked) {
      document.documentElement.classList.add("dark"); // Tambahkan kelas 'dark' ke elemen <html>
      localStorage.setItem("theme", "dark");
      moonIcon.classList.remove("hidden");
      sunIcon.classList.add("hidden");
      if (themeLabel) themeLabel.textContent = "Mode Gelap";
    } else {
      document.documentElement.classList.remove("dark"); // Hapus kelas 'dark' dari elemen <html>
      localStorage.setItem("theme", "light");
      moonIcon.classList.add("hidden");
      sunIcon.classList.remove("hidden");
      if (themeLabel) themeLabel.textContent = "Mode Terang";
    }
  });

  // Set initial theme based on localStorage or system preference
  const savedTheme = localStorage.getItem("theme"); // Ambil preferensi tema dari localStorage
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
    toggleChatView(false); // Switch back to the welcome view
    input.value = ""; // Clear the input field
    currentChatId = null; // Reset current chat ID
    updateActiveChatInSidebar(null); // Remove active highlight
    // In a real app, you would also reset the chat history context on the server if it were stateful
    updateSendButtonState(); // Disable send button for the new empty chat
  });

  // Function to stop an ongoing generation
  function stopGeneration() {
    if (currentAbortController) {
      currentAbortController.abort();
      console.log("Permintaan dibatalkan oleh pengguna.");
    }
    resetChatState();
  }
  // --- UI View Management ---

  // Function to switch between welcome view and active chat view
  function toggleChatView(isChatting) {
    if (isChatting) {
      welcomeView.classList.add("hidden");
      chatBox.classList.remove("hidden");
      mainContainer.classList.remove("justify-center");
      form.classList.add("mt-auto");
    } else {
      chatBox.innerHTML = ""; // Clear chat box content
      chatBox.classList.add("hidden");
      welcomeView.classList.remove("hidden");
      mainContainer.classList.add("justify-center");
      form.classList.remove("mt-auto");
    }
  }

  // --- Responsive Sidebar Logic ---

  // Function to toggle sidebar visibility on mobile
  function toggleMobileSidebar() {
    sidebar.classList.toggle("-translate-x-full");
    sidebarOverlay.classList.toggle("hidden");
  }

  // Event listener for the mobile menu button to show the sidebar
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", toggleMobileSidebar);
  }

  // Event listener for the overlay to hide the sidebar when clicked
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", toggleMobileSidebar);
  }

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

  // Refactored function to handle sending a message and getting a response
  async function sendMessage(userMessage) {
    toggleChatView(true);
    appendMessage("user", userMessage);
    input.value = ""; // Clear input immediately

    // Save user message to history
    if (!currentChatId) {
      // This is the first message of a new chat
      const newChatId = `chat-${Date.now()}`;
      currentChatId = newChatId;
      chats[newChatId] = {
        title: "Percakapan Baru...",
        messages: [{ sender: "user", text: userMessage }],
      };
      createChatHistoryItem(chats[newChatId].title, newChatId);
      updateActiveChatInSidebar(newChatId);
      saveChatHistory();
      // Generate title in the background
      generateTitleForChat(newChatId, userMessage);
    } else {
      chats[currentChatId].messages.push({ sender: "user", text: userMessage });
      saveChatHistory();
    }

    await fetchAndStreamResponse();
  }

  // Function to generate a title for a new chat
  async function generateTitleForChat(chatId, userMessage) {
    try {
      const promptForTitle = `Buat satu judul singkat saja (maksimal 5 kata, tanpa penjelasan, tanpa daftar) berdasarkan pesan pertama berikut:\n"${userMessage}"\nLangsung jawab hanya dengan judul.`;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: promptForTitle, history: [] }), // No history for title generation
      });
      const result = await response.json();
      if (result.reply) {
        const generatedTitle = result.reply.replace(/["\n*]/g, "").trim();
        chats[chatId].title = generatedTitle;
        updateChatHistoryItemTitle(chatId, generatedTitle);
        saveChatHistory();
      }
    } catch (error) {
      console.error("Gagal membuat judul:", error);
      // The title will remain "Percakapan Baru..." which is fine as a fallback
    }
  }

  // Core function to fetch and stream the AI response
  async function fetchAndStreamResponse() {
    // Change button to "Stop" icon and disable input
    sendIcon.classList.add("hidden");
    stopIcon.classList.remove("hidden");
    input.disabled = true;
    updateSendButtonState();

    // Remove any existing regenerate buttons
    const existingRegenContainer = chatBox.querySelector(".regenerate-container");
    if (existingRegenContainer) {
      existingRegenContainer.remove();
    }

    showTypingIndicator(); // Tampilkan indikator "berpikir" sebelum memulai request

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    try {
      const history = chats[currentChatId]?.messages.slice(0, -1) || []; // Exclude the last user message from history for the payload
      const lastUserMessage = chats[currentChatId]?.messages.slice(-1)[0]?.text;

      const chatPayload = {
        history: history,
        message: lastUserMessage,
      };

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatPayload),
        signal: signal,
      });

      if (!chatResponse.ok) {
        throw new Error(`Server error: ${chatResponse.statusText}`);
      }

      const reader = chatResponse.body.getReader();
      const decoder = new TextDecoder();
      let fullBotResponse = "";
      let botMsgElement = null; // Inisialisasi elemen pesan bot sebagai null

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Pada chunk data pertama, buat elemen pesan dan sembunyikan indikator
        if (!botMsgElement) {
          hideTypingIndicator();
          botMsgElement = createBotMessageElement();
          chatBox.appendChild(botMsgElement);
        }

        const chunk = decoder.decode(value, { stream: true });
        fullBotResponse += chunk;
        renderMarkdown(botMsgElement, fullBotResponse);
      }

      // Hanya simpan dan tambahkan tombol regenerate jika ada respons yang diterima
      if (botMsgElement) {
        chats[currentChatId].messages.push({ sender: "bot", text: fullBotResponse });
        saveChatHistory();
        addRegenerateControls(botMsgElement);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error:", error);
        appendMessage("bot", `Error: ${error.message}`);
      }
    } finally {
      resetChatState();
    }
  }

  // Helper to create an empty bot message element for streaming
  function createBotMessageElement() {
    const msgElement = document.createElement("div");
    msgElement.classList.add(
      "message",
      "bot",
      "p-3", // Padding
      "rounded-2xl",
      "max-w-4/5",
      "break-words",
      "leading-tight",
      "shadow-sm",
      "bg-bubble-bot-light", // Warna latar belakang gelembung bot
      "text-text-bot-light", // Warna teks gelembung bot
      "self-start",
      "rounded-bl-none",
      "dark:bg-bubble-bot-dark",
      "dark:text-text-bot-dark"
    );
    return msgElement;
  }

  // Add message to chat box
  function appendMessage(sender, text, useTypewriter = false) {
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
        "bg-bubble-user-light", // Warna latar belakang gelembung user
        "text-text-user-light", // Warna teks gelembung user
        "self-end",
        "rounded-br-none",
        "dark:bg-bubble-user-dark"
      );
      msgElement.textContent = text;
      chatBox.appendChild(msgElement);
      chatBox.scrollTop = chatBox.scrollHeight;
    } else {
      // Bot message
      msgElement.classList.add(
        "bg-bubble-bot-light",
        "text-text-bot-light",
        "self-start",
        "rounded-bl-none",
        "dark:bg-bubble-bot-dark",
        "dark:text-text-bot-dark"
      );

      // This path is now only for historical messages, which should be rendered directly.
      chatBox.appendChild(msgElement);
      renderMarkdown(msgElement, text);
    }
  }

  // Function to add regenerate controls below a bot message
  function addRegenerateControls(botMessageElement) {
    // Remove any existing controls first to ensure only the last message has it
    const existingControls = chatBox.querySelector(".regenerate-container");
    if (existingControls) {
      existingControls.remove();
    }

    const container = document.createElement("div");
    container.classList.add(
      "regenerate-container",
      "self-start",
      "ml-2",
      "mt-1"
    );

    const regenerateButton = document.createElement("button");
    // Menggunakan ikon SVG yang lebih modern untuk Regenerate
    regenerateButton.innerHTML = `
      <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M4 4l5 5M20 20l-5-5"></path></svg>
      <span>Regenerate</span>
    `;
    regenerateButton.classList.add(
      "flex", "items-center", "text-xs", "py-1", "px-2", "rounded-md",
      "text-text-secondary-light", "dark:text-text-secondary-dark",
      "hover:bg-icon-hover-light", "dark:hover:bg-icon-hover-dark",
      "transition-colors"
    );

    regenerateButton.addEventListener("click", async () => {
      // Remove the bot message from UI and history
      botMessageElement.remove();
      container.remove();
      chats[currentChatId].messages.pop(); // Remove last bot message
      saveChatHistory();

      // Fetch a new response
      await fetchAndStreamResponse();
    });

    container.appendChild(regenerateButton);
    chatBox.appendChild(container);
    chatBox.scrollTop = chatBox.scrollHeight;
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
      // Add relative positioning for the copy button and group for hover effect
      pre.classList.add(
        "group",
        "relative",
        // Add padding and background color to the pre container
        "bg-white",
        "dark:bg-main-bg-dark", // Use main dark background for the container
        "p-4", // Add padding around the code
        "rounded-md",
        "overflow-hidden",
        "my-3",
        "shadow"
      );

      // Create and append the copy button
      const copyButton = document.createElement("button");
      const copyIconSVG = `<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg><span>Copy</span>`;
      const checkIconSVG = `<svg class="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span class="text-green-500">Copied!</span>`;
      copyButton.innerHTML = copyIconSVG;
      copyButton.classList.add(
        "copy-code-btn",
        "absolute", "top-2", "right-2",
        // Improved styling for better contrast and modern look
        "bg-surface-light", // Menggunakan warna permukaan terang
        "dark:bg-sidebar-dark", // Menggunakan warna sidebar gelap untuk kontras
        "hover:bg-icon-hover-light", // Hover terang
        "dark:hover:bg-icon-hover-dark", // Hover gelap
        "border", "border-border-light", // Border terang
        "dark:border-border-dark", // Border gelap
        "text-text-secondary-light", // Teks sekunder terang
        "dark:text-text-secondary-dark", // Teks sekunder gelap
        "text-xs", "font-sans", "font-medium",
        "py-1", "px-2", "rounded-md",
        "flex", "items-center",
        "opacity-0", "group-hover:opacity-100", // Show on hover of the pre block
        "transition-all", "duration-200"
      );

      copyButton.addEventListener("click", () => {
        // Prevent the button from being clicked again while in "Copied!" state
        if (copyButton.disabled) return;

        const codeToCopy = pre.querySelector("code")?.textContent || "";
        navigator.clipboard.writeText(codeToCopy).then(() => {
          copyButton.innerHTML = checkIconSVG;
          copyButton.disabled = true;
          setTimeout(() => {
            copyButton.innerHTML = copyIconSVG;
            copyButton.disabled = false;
          }, 2000);
        });
      });

      pre.appendChild(copyButton);
    });
    element.querySelectorAll("code").forEach((code) => {
      if (code.closest("pre")) {
        // Code within pre block
        code.classList.add("font-mono", "bg-transparent", "p-0", "text-sm");
      } else {
        // Inline code
        code.classList.add(
          "font-mono",
          "bg-icon-hover-light", // Latar belakang inline code
          "dark:bg-icon-hover-dark",
          "text-text-primary-light", // Teks inline code
          "dark:text-text-primary-dark",
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
    element.querySelectorAll("p").forEach((p) => {
      // Add margin to paragraphs, but not if they are the last element in the bubble
      if (p.nextElementSibling) {
        p.classList.add("mb-3");
      }
      // Remove margin from paragraphs inside list items to prevent double spacing
      if (p.closest("li")) {
        p.classList.remove("mb-3");
      }
    });

    // Lists
    element
      .querySelectorAll("ul")
      .forEach((ul) => ul.classList.add("list-disc", "list-outside", "pl-5", "my-4", "space-y-2"));
    element
      .querySelectorAll("ol")
      .forEach((ol) => ol.classList.add("list-decimal", "list-outside", "pl-5", "my-4", "space-y-2"));

    // List items
    element.querySelectorAll("li").forEach((li) => li.classList.add("pl-2"));

    // Strong/Bold text
    element.querySelectorAll("strong, b").forEach(strong => { // Memastikan teks tebal lebih menonjol
        strong.classList.add("font-semibold", "text-text-light", "dark:text-text-dark");
    });

    // Blockquotes
    element.querySelectorAll("blockquote").forEach((bq) => {
      bq.classList.add(
        "border-l-4",
        "border-gray-400",
        "pl-3",
        "italic",
        "text-text-secondary-light", // Teks sekunder
        "my-4",
        "dark:border-gray-500",
        "dark:text-secondary-text-dark"
      );
    });

    // Tables
    element.querySelectorAll("table").forEach((table) => {
      table.classList.add("w-full", "border-collapse", "my-4", "shadow-sm");
    });
    element.querySelectorAll("th, td").forEach((cell) => {
      cell.classList.add(
        "border",
        "border-gray-300",
        "dark:border-border-dark", // Border gelap
        "py-2",
        "px-3",
        "text-left"
      );
    });
    element.querySelectorAll("th").forEach((th) => {
      th.classList.add( // Header tabel
        "bg-icon-hover-light",
        "dark:bg-icon-hover-dark",
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
      <span class="h-2 w-2 mx-0.5 bg-text-secondary-light dark:bg-text-secondary-dark rounded-full inline-block animate-bounce-dot" style="animation-delay: -0.32s;"></span>
      <span class="h-2 w-2 mx-0.5 bg-text-secondary-light dark:bg-text-secondary-dark rounded-full inline-block animate-bounce-dot" style="animation-delay: -0.16s;"></span>
      <span class="h-2 w-2 mx-0.5 bg-text-secondary-light dark:bg-text-secondary-dark rounded-full inline-block animate-bounce-dot" style="animation-delay: 0s;"></span>
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
    #chat-history-list li.active { /* Gaya untuk item chat yang aktif */
      background-color: #E5E7EB; /* icon-hover-light */
    }
    .dark #chat-history-list li.active { /* Gaya untuk item chat aktif di dark mode */
      background-color: #4B5563; /* icon-hover-dark */
    }
  `;
  document.head.appendChild(styleTagActive);

  // Initial load of all chat histories from localStorage
  loadAllChatHistories();

  // Set the initial state of the send button to disabled
  updateSendButtonState();
});
