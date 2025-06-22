// Pastikan DOM sepenuhnya dimuat sebelum menjalankan skrip
document.addEventListener("DOMContentLoaded", () => {
  // --- Elemen DOM ---
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const chatFormWrapper = document.getElementById("chat-form-wrapper");
  const chatInputArea = document.getElementById("chat-input-area"); // New DOM element for drop zone
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

  // File upload elements
  const fileUploadInput = document.getElementById("file-upload");
  const filePillsContainer = document.getElementById("file-pills-container");

  // Confirmation modal elements
  const confirmModal = document.getElementById("confirm-modal");
  const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
  const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  // Elements for responsive behavior
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  // Media Modal Elements
  const listeningIndicator = document.getElementById("listening-indicator"); // New listening indicator
  const dictateBtn = document.getElementById("dictate-btn"); // New dictate button
  const mediaModal = document.getElementById("media-modal");
  const modalMediaContent = document.getElementById("modal-media-content");
  const modalMediaName = document.getElementById("modal-media-name");
  const closeModalBtn = document.getElementById("close-modal-btn");

  let db; // Variabel untuk menampung koneksi IndexedDB
  let chatItemToDelete = null; // Stores reference to the item to be deleted

  // --- Application State ---
  let chats = {}; // Object to hold all chat histories, e.g., { "chat-id-1": { title: "...", messages: [...] } }
  let currentChatId = null; // The ID of the currently active chat
  let selectedFiles = []; // Array to store multiple selected files: { id, file, previewSrc }
  let currentAbortController = null; // To manage ongoing fetch requests
  let isSidebarCollapsed = false; // Tracks the permanent collapsed state for hover functionality
  let activeObjectURLs = {}; // To track and manage blob URLs for memory management

  // --- IndexedDB Functions ---

  // Inisialisasi IndexedDB
  function initDB() {
    const request = indexedDB.open("ChatFileStorage", 1);

    request.onerror = (event) => {
      console.error("Database error:", event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("✅ Database berhasil dibuka.");
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore("files", { keyPath: "id" });
      console.log("✅ Object store 'files' berhasil dibuat.");
    };
  }

  // Menyimpan file ke IndexedDB
  async function saveFileToDB(id, file) {
    if (!db) return;
    const transaction = db.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");
    store.put({ id: id, file: file });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => reject(event.target.error);
    });
  }

  // Mengambil file dari IndexedDB
  async function getFileFromDB(id) {
    if (!db) return null;
    const transaction = db.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const request = store.get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () =>
        resolve(request.result ? request.result.file : null);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // --- URL & Memory Management ---
  function revokeObjectURLsForChat(chatId) {
    if (chatId && activeObjectURLs[chatId]) {
      // console.log(`Revoking ${activeObjectURLs[chatId].length} URLs for chat ${chatId}`);
      activeObjectURLs[chatId].forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      // Clear any active media elements in the modal if the chat is deleted/switched
      if (mediaModal.classList.contains("hidden") === false) {
        hideMediaModal();
      }
      delete activeObjectURLs[chatId];
    }
  }

  // --- Helper function to manage send button state ---
  function updateSendButtonState() {
    const isSending = !stopIcon.classList.contains("hidden");
    const isInputEmpty = input.value.trim() === "";
    const isFileSelected = selectedFiles.length > 0;

    if (isSending) {
      // If in "stop" mode, the button should always be enabled to allow cancellation.
      sendButton.disabled = false;
      sendButton.classList.remove("opacity-50", "cursor-not-allowed");
      dictateBtn.disabled = false; // Ensure dictate button is enabled
    } else {
      // If in "send" mode, disable based on whether the input is empty AND no file is selected.
      sendButton.disabled = isInputEmpty && !isFileSelected;
      dictateBtn.disabled = false; // Dictate button should always be enabled
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

    revokeObjectURLsForChat(currentChatId); // Revoke URLs for the chat we are leaving

    currentChatId = chatId;
    // Update URL to reflect the current chat ID
    window.history.pushState({ chatId: chatId }, "", `#${chatId}`);

    chatBox.innerHTML = ""; // Clear the chat box

    // Populate the chat box with messages from the selected history
    chats[chatId].messages.forEach((message) => {
      appendMessage(
        message.sender,
        message.text,
        false,
        message.files || message.image, // Handle both new `files` and old `image` properties
        message.timestamp
      );
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
  // Helper function to auto-resize textarea
  function autoResizeTextarea() {
    // Set a max-height in pixels to prevent infinite growth.
    const maxHeight = 200;
    input.style.height = "auto"; // Reset height to correctly calculate scrollHeight

    const newHeight = input.scrollHeight;

    if (newHeight > maxHeight) {
      input.style.height = `${maxHeight}px`;
      input.style.overflowY = "auto"; // Enable scrollbar when max height is reached
    } else {
      input.style.height = `${newHeight}px`;
      input.style.overflowY = "hidden"; // Hide scrollbar when below max height
    }
  }

  // Clears all selected files and their pills
  function clearAllSelectedFiles() {
    // Revoke object URLs to prevent memory leaks
    selectedFiles.forEach((fileObject) => {
      if (fileObject.previewSrc) {
        URL.revokeObjectURL(fileObject.previewSrc);
      }
    });
    selectedFiles = [];
    filePillsContainer.innerHTML = "";
    fileUploadInput.value = ""; // Reset the file input
    updateSendButtonState();
  }

  // Removes a single file by its unique ID
  function removeFileById(fileId) {
    // Find the file to revoke its URL before removing
    const fileToRemove = selectedFiles.find((f) => f.id === fileId);
    if (fileToRemove && fileToRemove.previewSrc) {
      URL.revokeObjectURL(fileToRemove.previewSrc);
    }

    selectedFiles = selectedFiles.filter((f) => f.id !== fileId);
    const pillToRemove = filePillsContainer.querySelector(
      `[data-file-id="${fileId}"]`
    );
    if (pillToRemove) {
      pillToRemove.remove();
    }
    updateSendButtonState();
  }

  // Helper function to get a preview element (image or icon)
  function getPreviewElementHTML(fileObject) {
    // For images with a data URL preview, show the image
    if (fileObject.file.type.startsWith("image/") && fileObject.previewSrc) {
      return `<img src="${fileObject.previewSrc}" class="w-10 h-10 object-cover rounded-md" />`;
    }

    // For other file types, show an appropriate icon
    let iconSVG = "";
    if (fileObject.file.type === "application/pdf") {
      // Specific PDF Icon
      iconSVG = `<svg class="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8.828a2 2 0 00-.586-1.414l-4.828-4.828A2 2 0 0011.172 2H4zm3 8a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z"></path></svg>`;
    } else if (fileObject.file.type.startsWith("audio/")) {
      // Audio File Icon
      iconSVG = `<svg class="w-6 h-6 text-sky-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M18 3a1 1 0 00-1.447-.894L4 6.44V17a1 1 0 001.447.894L18 13.56V3zM5 7.54l9-2.64v8.2l-9 2.64V7.54z"></path></svg>`;
    } else if (fileObject.file.type.startsWith("video/")) {
      // Video File Icon
      iconSVG = `<svg class="w-6 h-6 text-purple-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 001.553.832l3-2a1 1 0 000-1.664l-3-2z"></path></svg>`;
    } else if (fileObject.file.type === "text/plain") {
      // Text File Icon
      iconSVG = `<svg class="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>`;
    } else {
      // Generic File Icon for all other types
      iconSVG = `<svg class="w-6 h-6 text-text-secondary-light dark:text-text-secondary-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
    }

    return `
          <div class="w-10 h-10 flex items-center justify-center bg-icon-hover-light dark:bg-surface-dark rounded-md">
              ${iconSVG}
          </div>
      `;
  }

  // New function to create a file preview pill
  function createFilePill(fileObject) {
    const pill = document.createElement("div");
    pill.dataset.fileId = fileObject.id;
    pill.className =
      "flex items-center gap-2 bg-icon-hover-light dark:bg-icon-hover-dark p-1.5 rounded-lg text-sm animate-new-message";

    pill.innerHTML = `
        ${getPreviewElementHTML(fileObject)}
        <span class="text-text-primary-light dark:text-text-primary-dark truncate max-w-[150px]">${
          fileObject.file.name
        }</span>
        <button type="button" class="remove-file-btn p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-500 flex-shrink-0">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
        </button>
    `;

    filePillsContainer.appendChild(pill);
  }

  // Creates a temporary loading pill with a spinner
  function createLoadingPill(fileId, fileName) {
    const pill = document.createElement("div");
    pill.dataset.fileId = fileId;
    pill.className =
      "flex items-center gap-2 bg-icon-hover-light dark:bg-icon-hover-dark p-1.5 rounded-lg text-sm animate-new-message";

    pill.innerHTML = `
        <div class="w-10 h-10 flex items-center justify-center">
            <svg class="animate-spin h-5 w-5 text-text-secondary-light dark:text-text-secondary-dark" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
        <span class="text-text-primary-light dark:text-text-primary-dark truncate max-w-[150px]">${fileName}</span>
    `;
    filePillsContainer.appendChild(pill);
  }

  // Replaces the loading pill with the final preview pill
  function replacePillContent(fileId, fileObject) {
    const pill = filePillsContainer.querySelector(`[data-file-id="${fileId}"]`);
    if (!pill) return;

    pill.innerHTML = `
        ${getPreviewElementHTML(fileObject)}
        <span class="text-text-primary-light dark:text-text-primary-dark truncate max-w-[150px]">${
          fileObject.file.name
        }</span>
        <button type="button" class="remove-file-btn p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-500 flex-shrink-0">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
        </button>
    `;
  }

  // New function to process files from either input change or drag-and-drop
  function processNewFiles(filesArray) {
    const MAX_FILE_SIZE_MB = 10;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    if (filesArray.length > 0) {
      for (const file of filesArray) {
        // Check file size before processing
        if (file.size > MAX_FILE_SIZE_BYTES) {
          alert(
            `File "${file.name}" terlalu besar (Maks: ${MAX_FILE_SIZE_MB} MB). File tidak akan diunggah.`
          );
          continue; // Skip this file
        }

        // Create a unique ID for the file to manage it in the state
        const fileId = `${file.name}-${file.lastModified}-${file.size}`;
        // Prevent adding duplicates
        if (selectedFiles.some((f) => f.id === fileId)) continue;

        // Use URL.createObjectURL for a lightweight, in-memory preview.
        // This avoids creating large data:URL strings that crash localStorage.
        // The preview will only be available for the current session.
        let previewSrc = null;
        if (
          file.type.startsWith("image/") ||
          file.type.startsWith("audio/") ||
          file.type.startsWith("video/") ||
          file.type === "application/pdf" ||
          file.type === "text/plain"
        ) {
          previewSrc = URL.createObjectURL(file);
        }

        const newFileObject = {
          id: fileId,
          file: file,
          previewSrc: previewSrc,
        };

        // Simpan file ke IndexedDB untuk persistensi
        saveFileToDB(fileId, file);

        selectedFiles.push(newFileObject);
        createFilePill(newFileObject); // Directly create the final pill
        updateSendButtonState();
      }
    }
  }

  // Handle file selection
  fileUploadInput.addEventListener("change", (e) => {
    // Consolidate logic by calling the main processing function
    processNewFiles(Array.from(e.target.files));
  });

  input.addEventListener("input", () => {
    updateSendButtonState();
    autoResizeTextarea();
  });

  // Handle Enter to send, Shift+Enter for new line
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent new line
      // Manually trigger the form's submit event
      form.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    }
  });

  // Event listener for dictate button
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // If the button says "Stop", it means a request is in progress
    // Clicking it again should abort the request
    if (!stopIcon.classList.contains("hidden")) {
      stopGeneration();
      return; // Prevent further execution of the submit handler
    }

    const userMessage = input.value.trim(); // Get message
    // Allow sending if there's a message OR a file
    if (!userMessage && selectedFiles.length === 0) return;

    sendMessage(userMessage, selectedFiles); // Pass the array of files
  });

  // --- Speech-to-Text (Dictate) Functionality ---
  let recognition;
  let isDictating = false;
  let textBeforeDictation = ""; // Variabel untuk menyimpan teks sebelum dikte dimulai

  // Check for Web Speech API compatibility
  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = false; // Stop after a single utterance
    recognition.interimResults = true; // Get results while speaking
    recognition.lang = "id-ID"; // Set default language to Indonesian

    // Event when speech is recognized
    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      // Gabungkan dengan teks yang ada sebelum dikte dimulai.
      // Tambahkan spasi jika ada teks sebelumnya.
      const prefix = textBeforeDictation.trim() ? textBeforeDictation.trim() + " " : "";
      input.value = prefix + finalTranscript + interimTranscript;

      autoResizeTextarea(); // Adjust textarea height
      updateSendButtonState(); // Update send button state
    };

    // Event when recognition ends (either by user stopping, or no more speech)
    recognition.onend = () => {
      isDictating = false;
      textBeforeDictation = ""; // Reset teks yang disimpan
      hideListeningIndicator(); // Hide indicator
      dictateBtn.classList.remove("bg-accent-blue", "text-white"); // Remove active state styling
      dictateBtn.classList.add(
        "text-icon-default-light",
        "dark:text-icon-default-dark"
      );
      // If there's final text, trigger send
      if (input.value.trim() !== "" && selectedFiles.length === 0) {
        // Optionally, auto-send the message after dictation
        // form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    };

    // Event for errors
    recognition.onerror = (event) => {
      isDictating = false;
      hideListeningIndicator(); // Hide indicator on error
      dictateBtn.classList.remove("bg-accent-blue", "text-white");
      dictateBtn.classList.add(
        "text-icon-default-light",
        "dark:text-icon-default-dark"
      );

      // The 'no-speech' error is common if the user is silent. We don't need to show an alert for it.
      if (event.error !== 'no-speech') {
        console.error("Speech recognition error:", event.error);
        alert(`Terjadi kesalahan pengenalan suara: ${event.error}. Pastikan mikrofon Anda berfungsi dan izinkan akses.`);
      }
    };

    dictateBtn.addEventListener("click", () => {
      if (isDictating) {
        recognition.stop(); // Stop recognition if already dictating
      } else {
        textBeforeDictation = input.value; // Simpan teks saat ini sebelum memulai
        showListeningIndicator(); // Show indicator
        recognition.start(); // Start recognition
        isDictating = true;
        dictateBtn.classList.add("bg-accent-blue", "text-white"); // Add active state styling
        dictateBtn.classList.remove(
          "text-icon-default-light",
          "dark:text-icon-default-dark"
        );
      }
    });
  } else {
    // Hide dictate button if API is not supported
    dictateBtn.style.display = "none";
  }

  // Use event delegation for removing file pills
  filePillsContainer.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".remove-file-btn");
    if (removeBtn) {
      const pill = removeBtn.closest("[data-file-id]");
      if (pill) {
        const fileId = pill.dataset.fileId;
        removeFileById(fileId);
      }
    }
  });

  // Add drag-and-drop event listeners to the main chat container
  mainContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mainContainer.classList.add("bg-accent-blue-dark/10"); // Add a subtle visual indicator
  });

  mainContainer.addEventListener("dragleave", (e) => {
    e.stopPropagation();
    mainContainer.classList.remove("bg-accent-blue-dark/10");
  });

  mainContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mainContainer.classList.remove("bg-accent-blue-dark/10");

    const droppedFiles = e.dataTransfer.files;
    processNewFiles(Array.from(droppedFiles));
  });

  // --- Sidebar Management ---

  function collapseSidebar() {
    sidebar.classList.remove("w-64");
    sidebar.classList.add("w-16", "p-2", "items-center");
    searchContainer.classList.add("hidden"); // Sembunyikan search bar saat collapse
    sidebarHeaderExpanded.classList.add("hidden");
    sidebarHeaderCollapsed.classList.remove("hidden");
    chatHistoryList.classList.add(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    );
    sidebarFooterDiv.classList.add(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    );
  }

  function expandSidebar() {
    sidebar.classList.remove("w-16", "p-2", "items-center");
    sidebar.classList.add("w-64");
    searchContainer.classList.remove("hidden"); // Tampilkan search bar saat expand
    sidebarHeaderExpanded.classList.remove("hidden");
    sidebarHeaderCollapsed.classList.add("hidden");
    chatHistoryList.classList.remove(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    );
    sidebarFooterDiv.classList.remove(
      "opacity-0",
      "pointer-events-none",
      "h-0",
      "overflow-hidden",
      "p-0"
    );
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
  if (
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
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
    revokeObjectURLsForChat(currentChatId); // Revoke URLs for the chat we are leaving

    // Reset URL to the base path
    window.history.pushState({ chatId: null }, "", window.location.pathname);

    toggleChatView(false); // Switch back to the welcome view
    input.value = ""; // Clear the input field
    autoResizeTextarea(); // Reset textarea height
    clearAllSelectedFiles(); // Clear any selected files and their previews
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

  // Event listener for Delete button in confirmation modal
  confirmDeleteBtn.addEventListener("click", () => {
    if (chatItemToDelete) {
      const chatToDelete = chats[chatItemToDelete.dataset.chatId];
      // Hapus file terkait dari IndexedDB
      if (chatToDelete && chatToDelete.messages) {
        chatToDelete.messages.forEach((message) => {
          if (message.files) {
            message.files.forEach((file) => {
              if (file.id && db)
                db.transaction(["files"], "readwrite")
                  .objectStore("files")
                  .delete(file.id);
            });
          }
        });
      }

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

  // Event listener for Cancel button in confirmation modal
  cancelDeleteBtn.addEventListener("click", () => {
    confirmModal.classList.add("hidden"); // Hide modal
    chatItemToDelete = null; // Reset item to be deleted
  });

  // --- UI View Management ---

  // Function to switch between welcome view and active chat view
  function toggleChatView(isChatting) {
    if (isChatting) {
      welcomeView.classList.add("hidden");
      chatBox.classList.remove("hidden");
      mainContainer.classList.remove("justify-center");
      // Make form full-width when chat is active
      chatFormWrapper.classList.remove("max-w-3xl", "mx-auto");
      chatFormWrapper.classList.add("mt-auto");
    } else {
      chatBox.innerHTML = ""; // Clear chat box content
      chatBox.classList.add("hidden");
      welcomeView.classList.remove("hidden");
      mainContainer.classList.add("justify-center");
      // Center form when on welcome screen
      chatFormWrapper.classList.add("max-w-3xl", "mx-auto");
      chatFormWrapper.classList.remove("mt-auto");
    }
  }

  // --- Responsive Sidebar Logic ---

  // Function to toggle sidebar visibility on mobile
  function toggleMobileSidebar() {
    sidebar.classList.toggle("-translate-x-full");
    sidebarOverlay.classList.toggle("hidden");
  }

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
  async function sendMessage(userMessage, files = []) {
    toggleChatView(true);
    const isNewChat = !currentChatId;
    const chatIdForMessage = currentChatId || `chat-${Date.now()}`;

    // Create a representation of attachments for immediate display in the UI.
    // This version includes the temporary object URL for previews.
    const attachmentsForDisplay = files.map((f) => {
      // Track the URL for lifecycle management
      if (f.previewSrc) {
        if (!activeObjectURLs[chatIdForMessage]) {
          activeObjectURLs[chatIdForMessage] = [];
        }
        activeObjectURLs[chatIdForMessage].push(f.previewSrc);
      }
      return {
        name: f.file.name,
        type: f.file.type,
        previewSrc: f.previewSrc,
      };
    });

    // Create a lightweight, serializable representation for localStorage.
    // This version EXCLUDES the previewSrc to prevent exceeding storage quota.
    const attachmentsForStorage = files.map((f) => ({
      name: f.file.name,
      type: f.file.type,
      id: f.id,
    }));

    const messageTimestamp = Date.now(); // Buat timestamp sebelum menampilkan pesan
    // Animate and display the message in the UI
    appendMessage(
      "user",
      userMessage,
      true,
      attachmentsForDisplay,
      messageTimestamp
    );

    input.value = ""; // Clear input immediately
    autoResizeTextarea(); // Reset textarea height after sending
    // Manually clear the input state WITHOUT revoking the URLs, as they are now active in the chat.
    selectedFiles = [];
    filePillsContainer.innerHTML = "";
    fileUploadInput.value = "";
    updateSendButtonState();

    // Save user message to history
    const messageData = {
      sender: "user",
      text: userMessage,
      timestamp: messageTimestamp,
    };
    if (attachmentsForStorage.length > 0) {
      messageData.files = attachmentsForStorage; // Save the lightweight version to history
    }

    if (isNewChat) {
      currentChatId = chatIdForMessage;
      chats[currentChatId] = {
        title: "Percakapan Baru...",
        messages: [messageData],
      };
      createChatHistoryItem(chats[currentChatId].title, currentChatId);
      updateActiveChatInSidebar(currentChatId);
      window.history.pushState(
        { chatId: currentChatId },
        "",
        `#${currentChatId}`
      );
      // Generate title in the background
      generateTitleForChat(currentChatId, userMessage);
    } else {
      chats[currentChatId].messages.push(messageData);
    }
    saveChatHistory();

    await fetchAndStreamResponse(
      userMessage,
      files.map((f) => f.file)
    ); // Pass the raw File objects
  }

  // Function to generate a title for a new chat
  async function generateTitleForChat(chatId, userMessage) {
    try {
      const promptForTitle = `Buat satu judul singkat saja (maksimal 5 kata, tanpa penjelasan, tanpa daftar) berdasarkan pesan pertama berikut:\n"${userMessage}"\nLangsung jawab hanya dengan judul.`;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Explicitly request a non-streaming JSON response for title generation
        body: JSON.stringify({
          message: promptForTitle,
          history: [],
          stream: false,
        }),
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
  async function fetchAndStreamResponse(userMessage, files = []) {
    // Add userMessage and file parameters
    // Change button to "Stop" icon and disable input
    sendIcon.classList.add("hidden");
    stopIcon.classList.remove("hidden");
    input.disabled = true;
    updateSendButtonState();

    // Remove any existing regenerate buttons
    const existingRegenContainer = chatBox.querySelector(
      ".regenerate-container"
    );
    if (existingRegenContainer) {
      existingRegenContainer.remove();
    }

    showTypingIndicator(); // Tampilkan indikator "berpikir" sebelum memulai request

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    try {
      // Exclude the last user message from history for the payload, as it's sent separately
      const history = chats[currentChatId]?.messages.slice(0, -1) || [];

      const formData = new FormData();
      formData.append("message", userMessage); // Append current user message
      formData.append("history", JSON.stringify(history)); // History as JSON string
      formData.append("stream", true); // Always stream for main chat

      if (files && files.length > 0) {
        files.forEach((file) => {
          formData.append("files", file); // Use 'files' to match backend
        });
      }

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        // No 'Content-Type' header needed for FormData, browser sets it automatically
        body: formData,
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
        chats[currentChatId].messages.push({
          sender: "bot",
          text: fullBotResponse,
          timestamp: Date.now(),
        });
        saveChatHistory();
        // Pass the timestamp to be added to the UI
        addRegenerateControls(botMsgElement, userMessage, files, Date.now());
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error:", error);
        appendMessage("bot", `Error: ${error.message}`, true); // Animate error message
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
      "dark:text-text-bot-dark",
      "animate-new-message" // Add animation class for new bot messages
    );
    return msgElement;
  }

  // Add message to chat box
  function appendMessage(
    sender,
    text,
    animate = false,
    attachments = [],
    timestamp
  ) {
    // --- Backward Compatibility & Normalization ---
    // Handle old data format where `attachments` might be an array of image strings (`imageSrcs`).
    const normalizedAttachments = (attachments || []).map((item) =>
      typeof item === "string"
        ? { type: "image/jpeg", previewSrc: item, name: "image.jpg" }
        : item
    );

    const msgElement = document.createElement("div");
    const contentContainer = document.createElement("div"); // Declare contentContainer here

    // Apply common classes for all messages
    msgElement.classList.add(
      "message",
      sender,
      "p-3",
      "rounded-2xl",
      "max-w-4/5",
      "break-words",
      "leading-tight",
      "shadow-sm",
      "flex-none",
      "flex",
      "flex-col" // Use flex-col to stack content and timestamp
    );

    // Apply animation only if requested (for new messages)
    if (animate) {
      msgElement.classList.add("animate-new-message");
    }

    if (sender === "user") {
      msgElement.classList.add(
        "bg-bubble-user-light", // Warna latar belakang gelembung user
        "text-text-user-light", // Warna teks gelembung user
        "self-end",
        "rounded-br-none",
        "dark:bg-bubble-user-dark"
      );

      // If there are attachments, create a container for them
      if (normalizedAttachments.length > 0) {
        const attachmentGridContainer = document.createElement("div");
        // Adjust grid columns based on number of items for better layout
        const gridCols =
          normalizedAttachments.length === 1
            ? "grid-cols-1"
            : "grid-cols-2 sm:grid-cols-3";
        attachmentGridContainer.className = `grid ${gridCols} gap-2`;
        if (text) attachmentGridContainer.classList.add("mb-2");

        normalizedAttachments.forEach((file) => {
          const attachmentWrapper = document.createElement("div");
          attachmentGridContainer.appendChild(attachmentWrapper);

          if (file.previewSrc) {
            // File dari sesi saat ini, URL sudah tersedia
            attachmentWrapper.appendChild(
              createAttachmentElement(file, file.previewSrc)
            );
          } else if (file.id) {
            // File dari riwayat, ambil dari IndexedDB
            // Tampilkan placeholder dulu
            attachmentWrapper.appendChild(
              createAttachmentElement({ type: "placeholder", name: file.name })
            );

            getFileFromDB(file.id).then((fileBlob) => {
              if (fileBlob) {
                const previewSrc = URL.createObjectURL(fileBlob);
                // Track the newly created URL for memory management
                if (!activeObjectURLs[currentChatId]) {
                  activeObjectURLs[currentChatId] = [];
                }
                activeObjectURLs[currentChatId].push(previewSrc);
                // Ganti placeholder dengan elemen yang sebenarnya
                attachmentWrapper.innerHTML = "";
                attachmentWrapper.appendChild(
                  createAttachmentElement(file, previewSrc)
                );
              } else {
                // File tidak ditemukan di DB
                attachmentWrapper.innerHTML = "";
                attachmentWrapper.appendChild(
                  createAttachmentElement(file, null)
                );
              }
            });
          }
        });
        contentContainer.appendChild(attachmentGridContainer);
      }

      // Add text if it exists
      if (text) {
        const textNode = document.createElement("p");
        textNode.textContent = text;
        textNode.classList.add("m-0", "p-0"); // Reset paragraph margins
        contentContainer.appendChild(textNode);
      }
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

      // Bot messages in this app don't contain file previews, only text.
      // This path is for historical messages and the final rendering of streamed messages.
      renderMarkdown(contentContainer, text); // Render markdown for bot messages
    }

    // Add the content container to the main message element
    msgElement.appendChild(contentContainer);

    // Add timestamp if it exists
    if (timestamp) {
      const timestampEl = document.createElement("div");
      const timeString = new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      timestampEl.textContent = timeString;

      timestampEl.classList.add("text-xs", "opacity-75", "mt-1.5");
      // Add sender-specific classes correctly by splitting the string of classes
      const senderClasses =
        sender === "user"
          ? "text-text-user-light dark:text-text-user-dark text-right"
          : "text-text-bot-light dark:text-text-bot-dark text-left";
      timestampEl.classList.add(...senderClasses.split(" "));
      msgElement.appendChild(timestampEl);
    }

    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Helper baru untuk membuat elemen lampiran yang interaktif
  function createAttachmentElement(file, previewSrc) {
    const attachmentEl = document.createElement("div");
    attachmentEl.className = "flex";

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = previewSrc;
      img.className =
        "w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity";
      img.alt = file.name;
      img.onclick = () => showMediaModal(previewSrc, file.type, file.name);
      attachmentEl.appendChild(img);
    } else if (file.type === "application/pdf") {
      const pdfButton = document.createElement("button");
      pdfButton.type = "button";
      pdfButton.title = `Buka ${file.name}`;
      pdfButton.className =
        "flex flex-col items-center justify-center p-2 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors w-full h-full text-left";
      pdfButton.innerHTML = `
            <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8.828a2 2 0 00-.586-1.414l-4.828-4.828A2 2 0 0011.172 2H4zm3 8a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
            <span class="text-xs text-center break-all text-text-user-light dark:text-text-user-dark mt-1">${file.name}</span>
        `;
      pdfButton.onclick = () => {
        const pdfWindow = window.open("", "_blank");
        if (pdfWindow) {
          pdfWindow.document.write(
            `<html lang="en"><head><title>${encodeURIComponent(
              file.name
            )}</title><style>body,html{margin:0;padding:0;overflow:hidden;}</style></head><body><iframe width="100%" height="100%" src="${previewSrc}" frameborder="0"></iframe></body></html>`
          );
          pdfWindow.document.close();
        } else {
          alert("Gagal membuka PDF. Mohon izinkan pop-up untuk situs ini.");
        }
      };
      attachmentEl.appendChild(pdfButton);
    } else if (
      file.type.startsWith("audio/") ||
      file.type.startsWith("video/")
    ) {
      const mediaButton = document.createElement("button");
      mediaButton.type = "button";
      mediaButton.title = `Buka ${file.name}`;
      mediaButton.className =
        "flex flex-col items-center justify-center p-2 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors w-full h-full text-left";
      mediaButton.onclick = () =>
        showMediaModal(previewSrc, file.type, file.name);

      let iconSVG = "";
      if (file.type.startsWith("audio/")) {
        iconSVG = `<svg class="w-8 h-8 text-sky-500 dark:text-sky-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M18 3a1 1 0 00-1.447-.894L4 6.44V17a1 1 0 001.447.894L18 13.56V3zM5 7.54l9-2.64v8.2l-9 2.64V7.54z"></path></svg>`;
      } else {
        // Video
        iconSVG = `<svg class="w-8 h-8 text-purple-500 dark:text-purple-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 001.553.832l3-2a1 1 0 000-1.664l-3-2z"></path></svg>`;
      }
      mediaButton.innerHTML = `${iconSVG}<span class="text-xs text-center break-all text-text-user-light dark:text-text-user-dark mt-1">${file.name}</span>`;
      attachmentEl.appendChild(mediaButton);
    } else if (file.type === "text/plain") {
      const textLink = document.createElement("a");
      textLink.href = previewSrc;
      textLink.target = "_blank";
      textLink.rel = "noopener noreferrer";
      textLink.title = `Buka ${file.name}`;
      textLink.className =
        "flex flex-col items-center justify-center p-2 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors w-full h-full text-left";
      textLink.innerHTML = `
            <svg class="w-8 h-8 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
            <span class="text-xs text-center break-all text-text-user-light dark:text-text-user-dark mt-1">${file.name}</span>
        `;
      attachmentEl.appendChild(textLink);
    } else {
      // Fallback untuk tipe file lain atau file dari riwayat yang tidak ditemukan di DB
      attachmentEl.className =
        "flex flex-col items-center justify-center p-2 rounded-lg bg-black/10 dark:bg-white/10";
      attachmentEl.innerHTML = `
            <svg class="w-8 h-8 text-text-secondary-light dark:text-text-secondary-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <span class="text-xs text-center break-all text-text-user-light dark:text-text-user-dark mt-1">${
              file.name || "File"
            }</span>
            ${
              !previewSrc
                ? '<span class="text-xxs text-red-500 mt-1">Not Found</span>'
                : ""
            }
        `;
    }
    return attachmentEl;
  }

  // Function to add regenerate controls below a bot message
  function addRegenerateControls(
    botMessageElement,
    lastUserMessage,
    lastFiles,
    timestamp
  ) {
    // Remove any existing controls first to ensure only the last message has it
    const existingControls = chatBox.querySelector(".regenerate-container");
    if (existingControls) {
      existingControls.remove();
    }

    // Add timestamp to the bot message bubble now that streaming is complete
    if (timestamp) {
      const timestampEl = document.createElement("div");
      const timeString = new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      timestampEl.textContent = timeString;
      timestampEl.classList.add(
        "text-xs",
        "opacity-75",
        "mt-1.5",
        "text-left",
        "text-text-bot-light",
        "dark:text-text-bot-dark"
      );
      botMessageElement.appendChild(timestampEl);
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
      "flex",
      "items-center",
      "text-xs",
      "py-1",
      "px-2",
      "rounded-md",
      "text-text-secondary-light",
      "dark:text-text-secondary-dark",
      "hover:bg-icon-hover-light",
      "dark:hover:bg-icon-hover-dark",
      "transition-colors"
    );

    regenerateButton.addEventListener("click", async () => {
      // Remove the bot message from UI and history
      botMessageElement.remove();
      container.remove();
      chats[currentChatId].messages.pop(); // Remove last bot message
      saveChatHistory();

      // Fetch a new response
      await fetchAndStreamResponse(lastUserMessage, lastFiles); // Use the last message and files for regeneration
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
        "absolute",
        "top-2",
        "right-2",
        // Improved styling for better contrast and modern look
        "bg-surface-light", // Menggunakan warna permukaan terang
        "dark:bg-sidebar-dark", // Menggunakan warna sidebar gelap untuk kontras
        "hover:bg-icon-hover-light", // Hover terang
        "dark:hover:bg-icon-hover-dark", // Hover gelap
        "border",
        "border-border-light", // Border terang
        "dark:border-border-dark", // Border gelap
        "text-text-secondary-light", // Teks sekunder terang
        "dark:text-text-secondary-dark", // Teks sekunder gelap
        "text-xs",
        "font-sans",
        "font-medium",
        "py-1",
        "px-2",
        "rounded-md",
        "flex",
        "items-center",
        "opacity-0",
        "group-hover:opacity-100", // Show on hover of the pre block
        "transition-all",
        "duration-200"
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
      .forEach((ul) =>
        ul.classList.add(
          "list-disc",
          "list-outside",
          "pl-5",
          "my-4",
          "space-y-2"
        )
      );
    element
      .querySelectorAll("ol")
      .forEach((ol) =>
        ol.classList.add(
          "list-decimal",
          "list-outside",
          "pl-5",
          "my-4",
          "space-y-2"
        )
      );

    // List items
    element.querySelectorAll("li").forEach((li) => li.classList.add("pl-2"));

    // Strong/Bold text
    element.querySelectorAll("strong, b").forEach((strong) => {
      // Memastikan teks tebal lebih menonjol
      strong.classList.add(
        "font-semibold",
        "text-text-light",
        "dark:text-text-dark"
      );
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
      th.classList.add(
        // Header tabel
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

  // --- Dictate Listening Indicator ---
  function showListeningIndicator() {
    listeningIndicator.classList.remove("hidden");
    // Add a small delay before making it visible to allow for smooth transition
    setTimeout(() => {
      listeningIndicator.classList.add("opacity-100");
    }, 50);

    // Add typing cursor effect to textarea
    input.classList.add("typing-cursor");
    input.placeholder = "Mendengarkan..."; // Change placeholder
    input.disabled = true; // Disable input while dictating
  }

  function hideListeningIndicator() {
    listeningIndicator.classList.remove("opacity-100");
    // Add a small delay before hiding completely to allow for smooth transition
    setTimeout(() => {
      listeningIndicator.classList.add("hidden");
    }, 300); // Match CSS transition duration

    // Remove typing cursor effect
    input.classList.remove("typing-cursor");
    input.placeholder = "Ketik pesan Anda..."; // Reset placeholder
    input.disabled = false; // Re-enable input
    input.focus(); // Put focus back on input
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
    /* Animation for new messages */
    @keyframes fadeInSlideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .animate-new-message {
      animation: fadeInSlideUp 0.3s ease-out forwards;
    }
    /* Typing cursor effect for input */
    .typing-cursor {
      caret-color: transparent; /* Hide actual cursor */
      animation: blink-caret 0.75s step-end infinite;
    }
    @keyframes blink-caret {
      from, to { border-right-color: transparent }
      50% { border-right-color: currentColor; }
    }
    /* Ensure textarea has a right border for the typing effect */
    textarea.typing-cursor { border-right: 2px solid; }
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

  // Inisialisasi IndexedDB saat aplikasi dimuat
  initDB();

  // Add a listener to revoke all remaining URLs on page unload to be thorough
  window.addEventListener("beforeunload", () =>
    Object.keys(activeObjectURLs).forEach(revokeObjectURLsForChat)
  );

  // --- Initial Page Load & URL Routing ---

  // Handle browser back/forward navigation
  window.addEventListener("popstate", (event) => {
    const state = event.state;
    if (state && state.chatId && chats[state.chatId]) {
      loadChat(state.chatId);
    } else {
      // If state is null or chat doesn't exist, go back to the welcome screen
      newChatBtn.click();
    }
  });

  // Initial load of all chat histories from localStorage
  loadAllChatHistories();

  // Check URL hash on initial load to open a specific chat
  const chatIdFromUrl = window.location.hash.substring(1);
  if (chatIdFromUrl && chats[chatIdFromUrl]) {
    loadChat(chatIdFromUrl);
  }

  // Event listener for the mobile menu button to show the sidebar
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", toggleMobileSidebar);
  }

  // Event listener for the overlay to hide the sidebar when clicked
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", toggleMobileSidebar);
  }

  // Set the initial state of the send button to disabled
  updateSendButtonState();

  // --- Media Modal Logic ---
  function showMediaModal(src, type, name) {
    modalMediaName.textContent = name;
    modalMediaContent.innerHTML = ""; // Clear previous content

    let mediaElement;
    if (type.startsWith("image/")) {
      mediaElement = document.createElement("img");
      mediaElement.className = "max-w-full max-h-full object-contain";
      mediaElement.alt = name;
    } else if (type.startsWith("audio/")) {
      mediaElement = document.createElement("audio");
      mediaElement.className = "w-full";
      mediaElement.controls = true;
    } else if (type.startsWith("video/")) {
      mediaElement = document.createElement("video");
      mediaElement.className = "max-w-full max-h-full";
      mediaElement.controls = true;
    }

    if (mediaElement) {
      mediaElement.src = src;
      modalMediaContent.appendChild(mediaElement);
    }

    mediaModal.classList.remove("hidden");
    // Add a class to body to prevent scrolling when modal is open
    document.body.classList.add("overflow-hidden");
  }

  function hideMediaModal() {
    mediaModal.classList.add("hidden");
    modalMediaContent.innerHTML = ""; // Stop playback and clear content
    document.body.classList.remove("overflow-hidden");
  }

  // Event listeners for modal
  closeModalBtn.addEventListener("click", hideMediaModal);
  mediaModal.addEventListener("click", (e) => {
    // Close modal if the click is on the background overlay itself, not on the content
    if (e.target === mediaModal) {
      hideMediaModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !mediaModal.classList.contains("hidden")) {
      hideMediaModal();
    }
  });

  // Small CSS addition for "Not Found" text
  const styleTagExtra = document.createElement("style");
  styleTagExtra.innerHTML = `.text-xxs { font-size: 0.65rem; line-height: 0.8rem; }`;
  document.head.appendChild(styleTagExtra);
});
