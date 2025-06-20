const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");

form.addEventListener("submit", function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  appendMessage("user", userMessage);
  input.value = ""; // Clear input immediately

  // Send message to backend
  fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: userMessage }), // Send message in the expected format
  })
    .then((response) => {
      if (!response.ok) {
        // Handle HTTP errors
        return response.json().then((err) => {
          throw new Error(err.reply || "Server error");
        });
      }
      return response.json();
    })
    .then((data) => {
      appendMessage("bot", data.reply); // Append the bot's reply
    })
    .catch((error) => {
      console.error("Error:", error);
      appendMessage("bot", `Error: ${error.message}`); // Display error message
    });
});

function appendMessage(sender, text) {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}
